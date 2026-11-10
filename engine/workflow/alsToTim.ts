import type { AlsAgent, AlsBridgeResult, AlsPipeline, AlsRoutingNode } from "../../shared/alsRouting";
import type { ConversionLine, GraphWithMeta } from "../../shared/workflowImport";
import { createNode, relationOf, type GraphEdge, type GraphNode } from "../../shared/mesh";

const STRUCTURAL = new Set(["parallel", "merge", "end", "checkpoint", "loop", "delay"]);

function walkAgents(pipeline: AlsPipeline, startId: string, summary: ConversionLine[], visited = new Set<string>()): string[] {
  if (visited.has(startId)) return [];
  visited.add(startId);
  const node = pipeline.nodes.find((n) => n.id === startId);
  if (!node) return [];
  if (node.type === "agent") return [node.id];
  if (STRUCTURAL.has(node.type)) {
    if (node.type === "delay" || node.type === "loop" || node.type === "checkpoint") {
      summary.push({ severity: "unsupported", message: `${node.type.toUpperCase()} node ${node.id} omitted from mesh topology.` });
    }
    const out = pipeline.edges.filter((e) => e.from === startId);
    const agents: string[] = [];
    for (const e of out) agents.push(...walkAgents(pipeline, e.to, summary, visited));
    return agents;
  }
  return [];
}

function agentEdges(pipeline: AlsPipeline, summary: ConversionLine[]): { from: string; to: string; mode: string }[] {
  const agentIds = new Set(pipeline.nodes.filter((n) => n.type === "agent").map((n) => n.id));
  const pairs: { from: string; to: string; mode: string }[] = [];
  const roots = pipeline.nodes.filter((n) => !pipeline.edges.some((e) => e.to === n.id)).map((n) => n.id);

  const expand = (fromChartId: string): string[] => {
    const results: string[] = [];
    for (const e of pipeline.edges.filter((x) => x.from === fromChartId)) {
      const targets = walkAgents(pipeline, e.to, summary, new Set());
      for (const t of targets) results.push(t);
    }
    return results;
  };

  for (const root of roots.length ? roots : pipeline.nodes.map((n) => n.id)) {
    const fromAgents = walkAgents(pipeline, root, summary, new Set());
    for (const from of fromAgents) {
      const outs = expand(from);
      for (const to of outs) {
        if (from === to || !agentIds.has(from) || !agentIds.has(to)) continue;
        const edge = pipeline.edges.find((e) => e.from === from && e.to === to);
        pairs.push({ from, to, mode: edge?.mode ?? "serial" });
      }
    }
  }

  // Direct agent-to-agent edges
  for (const e of pipeline.edges) {
    const from = pipeline.nodes.find((n) => n.id === e.from);
    const to = pipeline.nodes.find((n) => n.id === e.to);
    if (from?.type === "agent" && to?.type === "agent") {
      pairs.push({ from: e.from, to: e.to, mode: e.mode });
    }
  }

  const seen = new Set<string>();
  return pairs.filter((p) => {
    const key = `${p.from}->${p.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findAgent(agents: AlsAgent[], agentId: string | null | undefined): AlsAgent | undefined {
  if (!agentId) return undefined;
  return agents.find((a) => a.id === agentId);
}

function parseTimAttachment(node: AlsRoutingNode): string | undefined {
  const file = (node.attachments || []).find((a) => a.name === "tim-mesh-context.md");
  return file?.text;
}

export function convertAlsPipelineToTim(pipeline: AlsPipeline, agents: AlsAgent[]): AlsBridgeResult {
  const summary: ConversionLine[] = [
    {
      severity: "warning",
      message: "ALS routing charts import as flow edges only — brain/tool wiring must be added in the mesh.",
    },
  ];

  const chartAgents = pipeline.nodes.filter((n) => n.type === "agent");
  if (!chartAgents.length) {
    return { ok: false, name: pipeline.name, summary, error: "Pipeline has no agent nodes." };
  }

  const idMap = new Map<string, string>();
  const nodes: GraphNode[] = [];

  for (const chartNode of chartAgents) {
    const als = findAgent(agents, chartNode.agentId);
    const tim = createNode("agent", { x: chartNode.x, y: chartNode.y });
    const data = tim.data;
    if (data.kind === "agent") {
      data.name = als?.name || chartNode.label || "Agent";
      data.role = als?.role || "Collaborator";
      data.systemPrompt =
        als?.systemPrompt ||
        "Imported from ALS routing chart. Connect an LLM brain and tools before running the mesh.";
      if (!als && chartNode.agentId) {
        summary.push({
          severity: "warning",
          message: `Chart node ${chartNode.id} references unknown agentId ${chartNode.agentId}.`,
        });
      }
      const hint = parseTimAttachment(chartNode);
      if (hint) summary.push({ severity: "ok", message: `Restored T.I.M. context attachment on "${data.name}".` });
    }
    idMap.set(chartNode.id, tim.id);
    nodes.push(tim);
  }

  const pairs = agentEdges(pipeline, summary);
  const edges: GraphEdge[] = pairs.map((p) => ({
    id: `e-${crypto.randomUUID().slice(0, 8)}`,
    source: idMap.get(p.from) || p.from,
    target: idMap.get(p.to) || p.to,
    type: "mesh",
    data: { relation: "flow" },
    sourceHandle: null,
    targetHandle: null,
  }));

  for (const p of pairs) {
    if (p.mode === "parallel") {
      summary.push({ severity: "warning", message: `Parallel edge ${p.from} → ${p.to} becomes mesh flow (batch semantics differ).` });
    }
  }

  const graph: GraphWithMeta = {
    nodes,
    edges,
    meta: {
      source: "als",
      originalName: pipeline.name,
      importedAt: new Date().toISOString(),
      notSemanticEquivalent: true,
      sourceNodeCount: pipeline.nodes.length,
      sourceEdgeCount: pipeline.edges.length,
    },
  };

  summary.push({ severity: "ok", message: `Imported ${nodes.length} agents and ${edges.length} flow edges.` });

  return { ok: true, name: pipeline.name, summary, graph };
}
