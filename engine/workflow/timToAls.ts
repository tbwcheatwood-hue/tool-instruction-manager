import type {
  AlsAgent,
  AlsAttachment,
  AlsAgentDraft,
  AlsBridgeResult,
  AlsPipeline,
  AlsRoutingEdge,
  AlsRoutingNode,
} from "../../shared/alsRouting";
import type { ConversionLine } from "../../shared/workflowImport";
import type { AgentData, Graph, GraphNode, LlmData, RouterData, ToolData } from "../../shared/mesh";
import { linkedIds, relationOf } from "../../shared/mesh";
import { resolveAgentIdByName } from "../alsState";

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function isTopologyNode(node: GraphNode): boolean {
  return node.type === "agent" || node.type === "router";
}

function flowEdges(graph: Graph): { from: string; to: string; label?: string; handle?: string | null }[] {
  const ids = new Set(graph.nodes.filter(isTopologyNode).map((n) => n.id));
  const edges: { from: string; to: string; label?: string; handle?: string | null }[] = [];
  for (const edge of graph.edges) {
    if (relationOf(edge) !== "flow") continue;
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    edges.push({
      from: edge.source,
      to: edge.target,
      handle: edge.sourceHandle,
      label: edge.sourceHandle && edge.sourceHandle !== "else" ? edge.sourceHandle : undefined,
    });
  }
  return edges;
}

function attachmentForAgent(graph: Graph, agentId: string, summary: ConversionLine[]): AlsAttachment | null {
  const lines: string[] = ["# T.I.M. mesh context (imported)", ""];
  const brains = linkedIds(graph, agentId, "brain");
  const tools = linkedIds(graph, agentId, "tool");
  let noted = false;
  for (const id of brains) {
    const n = graph.nodes.find((x) => x.id === id);
    if (n?.type === "llm") {
      const data = n.data as LlmData;
      lines.push(`- LLM brain: model \`${data.model || "?"}\` (node ${n.id})`);
      noted = true;
    }
  }
  for (const id of tools) {
    const n = graph.nodes.find((x) => x.id === id);
    if (n?.type === "tool") {
      const data = n.data as ToolData;
      lines.push(`- Tool: ${data.label || data.server} (node ${n.id})`);
      noted = true;
    }
  }
  if (!noted) return null;
  const text = lines.join("\n");
  summary.push({ severity: "ok", message: "Brain/tool links summarized on agent attachment." });
  return { name: "tim-mesh-context.md", bytes: text.length, text };
}

function timNodeToAls(node: GraphNode, agentId: string | null, attachment: AlsAttachment | null, num: number): AlsRoutingNode {
  const pos = node.position ?? { x: 0, y: 0 };
  if (node.type === "router") {
    const data = node.data as RouterData;
    return {
      id: node.id,
      type: "parallel",
      x: pos.x,
      y: pos.y,
      isolation: false,
      label: data.name || "Router",
      attachments: [],
    };
  }
  const data = node.data as AgentData;
  return {
    id: node.id,
    type: "agent",
    x: pos.x,
    y: pos.y,
    isolation: false,
    label: data.name,
    agentId,
    num,
    attachments: attachment ? [attachment] : [],
  };
}

export function collectAgentDrafts(graph: Graph): AlsAgentDraft[] {
  const drafts: AlsAgentDraft[] = [];
  for (const node of graph.nodes) {
    if (node.type !== "agent") continue;
    const data = node.data as AgentData;
    const brains = linkedIds(graph, node.id, "brain");
    let modelHint = "";
    for (const id of brains) {
      const llm = graph.nodes.find((n) => n.id === id && n.type === "llm");
      if (llm) {
        modelHint = (llm.data as LlmData).model;
        break;
      }
    }
    drafts.push({
      name: data.name || "Agent",
      role: data.role,
      systemPrompt: data.systemPrompt,
      modelHint,
    });
  }
  return drafts;
}

function insertStructural(
  nodes: Map<string, AlsRoutingNode>,
  rawEdges: { from: string; to: string; label?: string }[],
  summary: ConversionLine[],
): AlsRoutingEdge[] {
  const edges: AlsRoutingEdge[] = rawEdges.map((e, i) => ({
    id: uid("e"),
    from: e.from,
    to: e.to,
    mode: "serial",
    label: e.label,
  }));

  // Fan-out: insert parallel hop when one source has multiple targets.
  const bySource = new Map<string, AlsRoutingEdge[]>();
  for (const e of edges) {
    const list = bySource.get(e.from) || [];
    list.push(e);
    bySource.set(e.from, list);
  }
  for (const [source, outs] of bySource) {
    if (outs.length <= 1) continue;
    const srcNode = nodes.get(source);
    if (srcNode?.type === "parallel") {
      for (const e of outs) e.mode = "parallel";
      continue;
    }
    const pId = uid("par");
    const sx = srcNode?.x ?? 0;
    const sy = srcNode?.y ?? 0;
    nodes.set(pId, { id: pId, type: "parallel", x: sx + 40, y: sy + 40, isolation: false, attachments: [] });
    const first = outs[0];
    edges.splice(
      edges.indexOf(first),
      outs.length,
      { id: uid("e"), from: source, to: pId, mode: "serial" },
      ...outs.map((e) => ({ id: uid("e"), from: pId, to: e.to, mode: "parallel" as const, label: e.label })),
    );
    summary.push({ severity: "warning", message: `Fan-out from ${source} mapped via PARALLEL node.` });
  }

  // Fan-in: insert merge hop.
  const byTarget = new Map<string, AlsRoutingEdge[]>();
  for (const e of edges) {
    const list = byTarget.get(e.to) || [];
    list.push(e);
    byTarget.set(e.to, list);
  }
  for (const [target, ins] of byTarget) {
    if (ins.length <= 1) continue;
    const tgtNode = nodes.get(target);
    if (tgtNode?.type === "merge") continue;
    const mId = uid("mer");
    const tx = tgtNode?.x ?? 0;
    const ty = tgtNode?.y ?? 0;
    nodes.set(mId, { id: mId, type: "merge", x: tx - 40, y: ty - 40, isolation: false, attachments: [] });
    for (const e of ins) {
      e.to = mId;
      e.mode = "serial";
    }
    edges.push({ id: uid("e"), from: mId, to: target, mode: "serial" });
    summary.push({ severity: "warning", message: `Fan-in to ${target} mapped via MERGE node.` });
  }

  return edges;
}

function connectSinks(nodes: Map<string, AlsRoutingNode>, edges: AlsRoutingEdge[]): void {
  const sources = new Set(edges.map((e) => e.from));
  const targets = new Set(edges.map((e) => e.to));
  const all = new Set([...sources, ...targets, ...nodes.keys()]);
  const sinks = [...all].filter((id) => sources.has(id) && !targets.has(id) && nodes.get(id)?.type !== "end");
  if (!sinks.length) return;
  const endId = uid("end");
  const maxY = Math.max(...[...nodes.values()].map((n) => n.y), 0);
  nodes.set(endId, { id: endId, type: "end", x: 120, y: maxY + 120, isolation: false, attachments: [] });
  for (const s of sinks) {
    edges.push({ id: uid("e"), from: s, to: endId, mode: "serial" });
  }
}

export function convertTimGraphToAls(
  graph: Graph,
  flowName: string,
  agents: AlsAgent[],
  pipelineId?: string,
): AlsBridgeResult {
  const summary: ConversionLine[] = [
    {
      severity: "warning",
      message: "Structural conversion only — ALS routing charts do not run T.I.M. mesh brain/tool loops.",
    },
  ];

  const topology = graph.nodes.filter(isTopologyNode);
  if (topology.length === 0) {
    return {
      ok: false,
      name: flowName,
      summary,
      error: "No agent or router nodes to export.",
    };
  }

  for (const n of graph.nodes) {
    if (n.type === "llm" || n.type === "tool") {
      summary.push({
        severity: "warning",
        message: `${n.type} node "${n.id}" is not on the ALS chart (summarized in agent attachments when linked).`,
        sourceRef: n.id,
      });
    }
  }

  const nodes = new Map<string, AlsRoutingNode>();
  let agentNum = 1;

  for (const node of topology) {
    let agentId: string | null = null;
    let attachment: AlsAttachment | null = null;
    if (node.type === "agent") {
      const data = node.data as AgentData;
      agentId = resolveAgentIdByName(agents, data.name || "Agent");
      attachment = attachmentForAgent(graph, node.id, summary);
      nodes.set(node.id, timNodeToAls(node, agentId, attachment, agentNum++));
    } else if (node.type === "router") {
      const data = node.data as RouterData;
      summary.push({
        severity: "warning",
        message: `Router "${data.name}" mapped to PARALLEL; route rules are not auto-translated.`,
      });
      nodes.set(node.id, timNodeToAls(node, null, null, agentNum));
    }
  }

  const raw = flowEdges(graph);
  if (raw.length === 0 && topology.length > 1) {
    summary.push({ severity: "warning", message: "No flow edges between agents — chart nodes are disconnected." });
  }

  const edges = insertStructural(nodes, raw, summary);

  connectSinks(nodes, edges);

  const xs = [...nodes.values()].map((n) => n.x);
  const ys = [...nodes.values()].map((n) => n.y);
  const pipeline: AlsPipeline = {
    id: pipelineId || uid("wf"),
    name: flowName || "T.I.M. mesh export",
    nodes: [...nodes.values()],
    edges,
    viewport: { x: Math.min(...xs, 0), y: Math.min(...ys, 0), scale: 1 },
    snapGrid: true,
  };

  summary.push({
    severity: "ok",
    message: `Exported ${pipeline.nodes.length} chart nodes and ${pipeline.edges.length} edges.`,
  });

  return { ok: true, name: pipeline.name, summary, pipeline, pipelineId: pipeline.id };
}
