import { createNode, createToolNode, type AgentData, type GraphEdge, type GraphNode, type RouterData, type ToolData } from "../../../shared/mesh";
import type { ConversionLine, GraphWithMeta, ImportConversionResult } from "../../../shared/workflowImport";
import { componentLabel, nodeTypeName, pushSecretWarnings } from "./util";

type FlowisePayload = {
  name?: string;
  description?: string;
  flowData?: { nodes?: unknown[]; edges?: unknown[] };
  chatflow?: { nodes?: unknown[]; edges?: unknown[] };
  nodes?: unknown[];
  edges?: unknown[];
};

export function detectFlowise(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as FlowisePayload;
  if (record.flowData?.nodes || record.chatflow?.nodes) return true;
  const nodes = record.nodes;
  if (!Array.isArray(nodes)) return false;
  return nodes.some((n) => {
    if (!n || typeof n !== "object") return false;
    const node = n as Record<string, unknown>;
    const data = node.data as Record<string, unknown> | undefined;
    return Boolean(data?.label || data?.name || /chain|llm|agent|tool/i.test(String(data?.type ?? node.type)));
  });
}

export function convertFlowise(raw: unknown): ImportConversionResult {
  const summary: ConversionLine[] = [];
  if (!detectFlowise(raw)) {
    return { ok: false, error: "Not a Flowise export.", name: "", summary, detectedSource: "flowise" };
  }
  const record = raw as FlowisePayload;
  const srcNodes = (record.flowData?.nodes ?? record.chatflow?.nodes ?? record.nodes) as Record<string, unknown>[];
  const srcEdges = (record.flowData?.edges ?? record.chatflow?.edges ?? record.edges) as Record<string, unknown>[];
  if (!Array.isArray(srcNodes)) {
    return { ok: false, error: "Flowise export has no nodes array.", name: "", summary, detectedSource: "flowise" };
  }
  pushSecretWarnings(record, "flowise", summary);

  const idMap = new Map<string, string>();
  const nodes: GraphNode[] = [];
  for (const src of srcNodes) {
    const typeName = nodeTypeName(src);
    const t = typeName.toLowerCase();
    const position = (src.position as { x?: number; y?: number }) ?? { x: 0, y: 0 };
    const pos = { x: Number(position.x ?? 0), y: Number(position.y ?? 0) };
    let node: GraphNode;
    if (/chatopenai|ollama|lmchat|llm|azure|anthropic|mistral|groq/.test(t)) {
      node = createNode("llm", pos);
    } else if (/tool|serp|calculator|search|wikipedia/.test(t)) {
      node = createToolNode(/search|serp|wikipedia/.test(t) ? "web_search" : "filesystem", pos);
      (node.data as ToolData).label = componentLabel(src);
    } else if (/condition|router|ifelse/.test(t)) {
      node = createNode("router", pos);
      (node.data as RouterData).name = componentLabel(src);
    } else {
      node = createNode("agent", pos);
      const data = node.data as AgentData;
      data.name = componentLabel(src);
      data.role = typeName;
      data.systemPrompt = `Imported from Flowise "${typeName}". Review prompts — not a semantic port.`;
    }
    idMap.set(String(src.id), node.id);
    nodes.push(node);
    summary.push({
      severity: /unsupported/i.test(t) ? "unsupported" : "ok",
      message: `Flowise ${typeName} → ${node.type}`,
      sourceRef: String(src.id),
    });
  }

  const edges: GraphEdge[] = [];
  for (const src of srcEdges ?? []) {
    const source = idMap.get(String(src.source));
    const target = idMap.get(String(src.target));
    if (!source || !target) continue;
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

  summary.push({
    severity: "warning",
    message: "Flowise agent memory and tool calling differ from T.I.M. mesh execution — expect to rewire brain/tool edges.",
  });

  const graph: GraphWithMeta = {
    nodes,
    edges,
    meta: {
      source: "flowise",
      originalName: record.name,
      description: record.description,
      importedAt: new Date().toISOString(),
      sourceNodeCount: srcNodes.length,
      sourceEdgeCount: srcEdges?.length ?? 0,
      notSemanticEquivalent: true,
    },
  };

  return { ok: true, name: String(record.name || "Imported Flowise"), graph, summary, detectedSource: "flowise" };
}
