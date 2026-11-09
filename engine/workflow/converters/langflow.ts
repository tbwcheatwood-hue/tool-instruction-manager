import {
  createNode,
  createToolNode,
  type AgentData,
  type GraphEdge,
  type GraphNode,
  type LlmData,
  type NodeKind,
  type RouterData,
  type ToolData,
} from "../../../shared/mesh";
import type { ConversionLine, GraphWithMeta, ImportConversionResult, WorkflowPlatform } from "../../../shared/workflowImport";
import { componentLabel, nodeTypeName, pushSecretWarnings } from "./util";

type LangflowPayload = {
  name?: string;
  description?: string;
  data?: { nodes?: unknown[]; edges?: unknown[] };
  nodes?: unknown[];
  edges?: unknown[];
};

function mapKind(typeName: string): { kind: NodeKind | "tool-web"; note?: string } {
  const t = typeName.toLowerCase();
  if (/chatinput|textinput|prompt|input/.test(t)) return { kind: "agent", note: "mapped as agent (Langflow input/output semantics differ)" };
  if (/chatoutput|output|textoutput/.test(t)) return { kind: "agent", note: "mapped as agent sink" };
  if (/openai|anthropic|ollama|lmstudio|huggingface|groq|mistral|llm|model|chatgpt/.test(t)) return { kind: "llm" };
  if (/router|conditional|ifelse|route/.test(t)) return { kind: "router" };
  if (/agent|crew|autogen|supervisor/.test(t)) return { kind: "agent" };
  if (/wikipedia|duckduckgo|search|serp|tavily/.test(t)) return { kind: "tool-web", note: "mapped to web_search" };
  if (/bash|python|terminal|shell|code/.test(t)) return { kind: "tool-web", note: "mapped to bash tool (approval required)" };
  if (/file|directory|read|write|document/.test(t)) return { kind: "tool-web", note: "mapped to filesystem tool" };
  return { kind: "agent", note: "unsupported Langflow component represented as generic agent" };
}

function extractModelName(node: Record<string, unknown>): string {
  const data = node.data as Record<string, unknown> | undefined;
  const nest = data?.node as Record<string, unknown> | undefined;
  const template = nest?.template as Record<string, unknown> | undefined;
  if (!template) return "";
  for (const key of ["model_name", "model", "model_id", "openai_api_base"]) {
    const field = template[key] as { value?: unknown } | undefined;
    if (field?.value && typeof field.value === "string") return field.value;
  }
  return "";
}

export function detectLangflow(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as LangflowPayload;
  const nodes = record.data?.nodes ?? record.nodes;
  const edges = record.data?.edges ?? record.edges;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return false;
  return nodes.some((n) => {
    if (!n || typeof n !== "object") return false;
    const node = n as Record<string, unknown>;
    const data = node.data as Record<string, unknown> | undefined;
    return Boolean(data?.node ?? data?.type ?? (typeof node.type === "string" && node.type.includes("Chat")));
  });
}

export function convertLangflow(raw: unknown): ImportConversionResult {
  const summary: ConversionLine[] = [];
  if (!detectLangflow(raw)) {
    return { ok: false, error: "Not a Langflow export (expected data.nodes and data.edges).", name: "", summary, detectedSource: "langflow" };
  }
  const record = raw as LangflowPayload;
  const srcNodes = (record.data?.nodes ?? record.nodes) as Record<string, unknown>[];
  const srcEdges = (record.data?.edges ?? record.edges) as Record<string, unknown>[];
  pushSecretWarnings(record, "langflow", summary);

  const idMap = new Map<string, string>();
  const nodes: GraphNode[] = [];

  for (const src of srcNodes) {
    const typeName = nodeTypeName(src);
    const map = mapKind(typeName);
    const position = (src.position as { x?: number; y?: number }) ?? { x: 0, y: 0 };
    const pos = { x: Number(position.x ?? 0), y: Number(position.y ?? 0) };

    let node: GraphNode;
    if (map.kind === "tool-web") {
      const server = /bash|python|shell|code/.test(typeName.toLowerCase()) ? "bash" : /search|wikipedia|duck/.test(typeName.toLowerCase()) ? "web_search" : "filesystem";
      node = createToolNode(server, pos);
      (node.data as ToolData).label = componentLabel(src);
    } else if (map.kind === "llm") {
      node = createNode("llm", pos);
      const model = extractModelName(src);
      if (model) (node.data as LlmData).model = model;
    } else if (map.kind === "router") {
      node = createNode("router", pos);
      (node.data as RouterData).name = componentLabel(src);
    } else {
      node = createNode("agent", pos);
      const data = node.data as AgentData;
      data.name = componentLabel(src);
      data.role = typeName;
      data.systemPrompt = `Imported from Langflow component "${typeName}". Behavior is not equivalent — review and edit prompts.`;
    }

    const newId = node.id;
    idMap.set(String(src.id), newId);
    nodes.push(node);

    if (map.note) {
      summary.push({ severity: "warning", message: `${componentLabel(src)}: ${map.note}`, sourceRef: String(src.id) });
    } else {
      summary.push({ severity: "ok", message: `Converted ${typeName} → ${node.type}`, sourceRef: String(src.id) });
    }
  }

  const edges: GraphEdge[] = [];
  for (const src of srcEdges) {
    const source = idMap.get(String(src.source));
    const target = idMap.get(String(src.target));
    if (!source || !target) {
      summary.push({
        severity: "warning",
        message: `Dropped edge — missing endpoint (source=${String(src.source)}, target=${String(src.target)})`,
      });
      continue;
    }
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
    message:
      "Langflow dataflow ports are all mapped as T.I.M. flow edges. Brain/tool wiring is not preserved — connect LLM and tools manually.",
  });

  const name = String(record.name || "Imported Langflow");
  const graph: GraphWithMeta = {
    nodes,
    edges,
    meta: {
      source: "langflow" as WorkflowPlatform,
      originalName: record.name,
      description: record.description,
      importedAt: new Date().toISOString(),
      sourceNodeCount: srcNodes.length,
      sourceEdgeCount: srcEdges.length,
      notSemanticEquivalent: true,
    },
  };

  return { ok: true, name, graph, summary, detectedSource: "langflow" };
}
