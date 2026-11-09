import { createNode, createToolNode, type AgentData, type GraphEdge, type GraphNode, type RouterData, type ToolData } from "../../../shared/mesh";
import type { ConversionLine, GraphWithMeta, ImportConversionResult } from "../../../shared/workflowImport";
import { pushSecretWarnings } from "./util";

type N8nNode = {
  id?: string;
  name: string;
  type: string;
  position?: [number, number];
  parameters?: Record<string, unknown>;
};

type N8nPayload = {
  name?: string;
  nodes?: N8nNode[];
  connections?: Record<string, { main?: { node: string; type: string; index: number }[][] }>;
};

export function detectN8n(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as N8nPayload;
  if (!Array.isArray(record.nodes)) return false;
  return record.nodes.some((n) => typeof n.type === "string" && n.type.startsWith("n8n-nodes"));
}

export function convertN8n(raw: unknown): ImportConversionResult {
  const summary: ConversionLine[] = [];
  if (!detectN8n(raw)) {
    return { ok: false, error: "Not an n8n workflow export (expected nodes with n8n-nodes-base.* types).", name: "", summary, detectedSource: "n8n" };
  }
  const record = raw as N8nPayload;
  const srcNodes = record.nodes ?? [];
  pushSecretWarnings(record, "n8n", summary);

  const idByName = new Map<string, string>();
  const nodes: GraphNode[] = [];

  for (const src of srcNodes) {
    const t = src.type.toLowerCase();
    const pos = { x: Number(src.position?.[0] ?? 0), y: Number(src.position?.[1] ?? 0) };
    let node: GraphNode;
    if (t.includes("lmchat") || t.includes("openai") || t.includes("ollama") || t.includes("anthropic")) {
      node = createNode("llm", pos);
    } else if (t.includes("httprequest") || t.includes("webhook")) {
      node = createToolNode("fetch_url", pos);
      const fetchTool = node.data as ToolData;
      fetchTool.label = src.name;
      fetchTool.approval = true;
    } else if (t.includes("executecommand") || t.includes("code")) {
      node = createToolNode("bash", pos);
      const bashTool = node.data as ToolData;
      bashTool.label = src.name;
      bashTool.approval = true;
    } else if (t.includes("if") || t.includes("switch")) {
      node = createNode("router", pos);
      (node.data as RouterData).name = src.name;
    } else {
      node = createNode("agent", pos);
      const data = node.data as AgentData;
      data.name = src.name;
      data.role = src.type.replace(/^n8n-nodes-base\./, "");
      data.systemPrompt = `Placeholder for n8n node "${src.name}" (${src.type}). n8n schedules and credentials do not transfer.`;
    }
    idByName.set(src.name, node.id);
    nodes.push(node);
    summary.push({
      severity: t.includes("stickynote") || t.includes("noop") ? "unsupported" : "warning",
      message: `n8n ${src.type} → ${node.type} (behavior not equivalent)`,
      sourceRef: src.name,
    });
  }

  const edges: GraphEdge[] = [];
  const connections = record.connections ?? {};
  for (const [fromName, blocks] of Object.entries(connections)) {
    const source = idByName.get(fromName);
    if (!source) continue;
    for (const outputs of blocks.main ?? []) {
      for (const link of outputs ?? []) {
        const target = idByName.get(link.node);
        if (!target) continue;
        edges.push({
          id: `e-${crypto.randomUUID().slice(0, 8)}`,
          source,
          target,
          sourceHandle: "flow-out",
          targetHandle: "flow-in",
          type: "mesh",
          data: { relation: "flow" },
        });
      }
    }
  }

  summary.push({
    severity: "warning",
    message: "n8n triggers, credentials, and per-item execution are not represented in T.I.M.",
  });

  const graph: GraphWithMeta = {
    nodes,
    edges,
    meta: {
      source: "n8n",
      originalName: record.name,
      importedAt: new Date().toISOString(),
      sourceNodeCount: srcNodes.length,
      sourceEdgeCount: edges.length,
      notSemanticEquivalent: true,
    },
  };

  return { ok: true, name: String(record.name || "Imported n8n"), graph, summary, detectedSource: "n8n" };
}
