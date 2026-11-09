export type NodeKind = "agent" | "llm" | "tool" | "router";
export type Relation = "flow" | "brain" | "tool";
export type ToolServer =
  | "filesystem"
  | "bash"
  | "git"
  | "sqlite"
  | "memory"
  | "web_search"
  | "fetch_url"
  | "workspace_info"
  | "mcp_bridge";

export type ToolAvailability = "ready" | "setup";

export type ToolCategory = "workspace" | "runtime" | "data" | "network" | "mcp";

export type AgentData = {
  kind: "agent";
  name: string;
  role: string;
  systemPrompt: string;
  broadcast: boolean;
  humanGate: boolean;
  remember: boolean;
};

export type LlmData = {
  kind: "llm";
  model: string;
  gpuLayers: number;
  nCtx: number;
  threads: number;
  temperature: number;
  topK: number;
  topP: number;
  repeatPenalty: number;
};

export type ToolData = {
  kind: "tool";
  server: ToolServer;
  label: string;
  approval: boolean;
};

export type RouteRule = {
  id: string;
  label: string;
  match: string;
};

export type RouterData = {
  kind: "router";
  name: string;
  routes: RouteRule[];
  fallback: string;
};

export type NodeData = AgentData | LlmData | ToolData | RouterData;

export type GraphNode = {
  id: string;
  type: NodeKind;
  position: { x: number; y: number };
  data: NodeData;
  selected?: boolean;
  dragging?: boolean;
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  selected?: boolean;
  data?: { relation?: Relation };
};

export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type FlowRecord = {
  id: string;
  name: string;
  graph: Graph;
  updatedAt: string;
};

export const EXAMPLE_FLOW_ID = "example-mesh";

export type ToolCatalogEntry = {
  id: ToolServer;
  label: string;
  hint: string;
  approval: boolean;
  category: ToolCategory;
  availability: ToolAvailability;
  setupNote?: string;
};

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    id: "filesystem",
    label: "Filesystem",
    hint: "List, read, and write files inside the tool workspace.",
    approval: false,
    category: "workspace",
    availability: "ready",
  },
  {
    id: "workspace_info",
    label: "Workspace info",
    hint: "Summarize the workspace path and file count.",
    approval: false,
    category: "workspace",
    availability: "ready",
  },
  {
    id: "git",
    label: "Git",
    hint: "Status, log, or diff inside the workspace repo.",
    approval: false,
    category: "workspace",
    availability: "ready",
  },
  {
    id: "bash",
    label: "Bash",
    hint: "Run a shell command in the workspace after approval.",
    approval: true,
    category: "runtime",
    availability: "ready",
  },
  {
    id: "sqlite",
    label: "SQLite query",
    hint: "Run a read-only SELECT against mesh memory tables.",
    approval: false,
    category: "data",
    availability: "ready",
  },
  {
    id: "memory",
    label: "Agent memory",
    hint: "Fetch recent agent messages stored for this mesh.",
    approval: false,
    category: "data",
    availability: "ready",
  },
  {
    id: "web_search",
    label: "Web search",
    hint: "DuckDuckGo instant answers (needs network).",
    approval: false,
    category: "network",
    availability: "ready",
  },
  {
    id: "fetch_url",
    label: "HTTP fetch",
    hint: "GET a public http or https URL (size-capped).",
    approval: true,
    category: "network",
    availability: "ready",
  },
  {
    id: "mcp_bridge",
    label: "MCP bridge",
    hint: "Proxy tool calls to an external MCP server you configure.",
    approval: true,
    category: "mcp",
    availability: "setup",
    setupNote: "Set MCP bridge URL in the Models panel, then approve each call.",
  },
];

/** @deprecated use TOOL_CATALOG */
export const TOOL_SERVERS = TOOL_CATALOG;

export function toolPreset(id: ToolServer): ToolCatalogEntry | undefined {
  return TOOL_CATALOG.find((item) => item.id === id);
}

export function relationFromHandles(sourceHandle?: string | null, targetHandle?: string | null): Relation {
  const handle = `${sourceHandle ?? ""} ${targetHandle ?? ""}`;
  if (handle.includes("brain")) return "brain";
  if (handle.includes("tool")) return "tool";
  return "flow";
}

export function relationOf(edge: GraphEdge): Relation {
  if (edge.data?.relation) return edge.data.relation;
  return relationFromHandles(edge.sourceHandle, edge.targetHandle);
}

export function chooseRoute(routes: RouteRule[], fallback: string, text: string): { handle: string; label: string } {
  const hay = text.toLowerCase();
  for (const route of routes) {
    const needle = route.match.trim().toLowerCase();
    if (needle && hay.includes(needle)) return { handle: route.id, label: route.label };
  }
  return { handle: "else", label: fallback };
}

export function linkedIds(graph: Graph, id: string, relation: Relation): string[] {
  const found: string[] = [];
  for (const edge of graph.edges) {
    if (relationOf(edge) !== relation) continue;
    if (edge.source === id) found.push(edge.target);
    else if (edge.target === id) found.push(edge.source);
  }
  return found;
}

export function entryNodes(graph: Graph): GraphNode[] {
  const incoming = new Set(graph.edges.filter((edge) => relationOf(edge) === "flow").map((edge) => edge.target));
  return graph.nodes.filter((node) => {
    if (node.type === "tool") return false;
    if (incoming.has(node.id)) return false;
    if (node.type === "llm") {
      return graph.edges.some((edge) => relationOf(edge) === "flow" && (edge.source === node.id || edge.target === node.id));
    }
    return node.type === "agent" || node.type === "router";
  });
}

export function parseToolCall(text: string): { name: string; args: Record<string, unknown> } | null {
  const match = /TOOL\s+([a-z_]+)\s+(\{[\s\S]*?\})/.exec(text);
  if (!match) return null;
  try {
    const args = JSON.parse(match[2]) as unknown;
    if (!args || typeof args !== "object" || Array.isArray(args)) return null;
    return { name: match[1], args: args as Record<string, unknown> };
  } catch {
    return null;
  }
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createNode(kind: NodeKind, position: { x: number; y: number }): GraphNode {
  if (kind === "agent") {
    const data: AgentData = {
      kind: "agent",
      name: "Agent",
      role: "Collaborator",
      systemPrompt: "You work inside a local mesh. Be brief, concrete, and hand off a clear next step.",
      broadcast: false,
      humanGate: false,
      remember: true,
    };
    return { id: id("agent"), type: "agent", position, data };
  }
  if (kind === "llm") {
    const data: LlmData = {
      kind: "llm",
      model: "",
      gpuLayers: 100,
      nCtx: 8192,
      threads: 8,
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      repeatPenalty: 1.1,
    };
    return { id: id("llm"), type: "llm", position, data };
  }
  if (kind === "tool") {
    return createToolNode("filesystem", position);
  }
  const data: RouterData = {
    kind: "router",
    name: "Route",
    routes: [{ id: "write", label: "Write", match: "write" }],
    fallback: "Continue",
  };
  return { id: id("router"), type: "router", position, data };
}

export function createToolNode(server: ToolServer, position: { x: number; y: number }): GraphNode {
  const preset = toolPreset(server);
  const data: ToolData = {
    kind: "tool",
    server,
    label: preset?.label ?? server,
    approval: preset?.approval ?? false,
  };
  return { id: id("tool"), type: "tool", position, data };
}

export function exampleGraph(): Graph {
  const llm: GraphNode = {
    id: "llm-main",
    type: "llm",
    position: { x: 64, y: 48 },
    data: {
      kind: "llm",
      model: "",
      gpuLayers: 100,
      nCtx: 8192,
      threads: 8,
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      repeatPenalty: 1.1,
    },
  };
  const planner: GraphNode = {
    id: "agent-planner",
    type: "agent",
    position: { x: 64, y: 300 },
    data: {
      kind: "agent",
      name: "Planner",
      role: "Breaks the task down",
      systemPrompt:
        "You are the planner. Use a connected tool when it will ground the answer. Then say whether the mesh should write a deliverable or continue with a review. One short paragraph.",
      broadcast: false,
      humanGate: false,
      remember: true,
    },
  };
  const files: GraphNode = {
    id: "tool-files",
    type: "tool",
    position: { x: 64, y: 560 },
    data: { kind: "tool", server: "filesystem", label: "Workspace files", approval: false },
  };
  const router: GraphNode = {
    id: "router-intent",
    type: "router",
    position: { x: 460, y: 300 },
    data: {
      kind: "router",
      name: "Intent",
      routes: [{ id: "write", label: "Write", match: "write" }],
      fallback: "Review",
    },
  };
  const writer: GraphNode = {
    id: "agent-writer",
    type: "agent",
    position: { x: 820, y: 140 },
    data: {
      kind: "agent",
      name: "Writer",
      role: "Drafts the deliverable",
      systemPrompt: "You write the deliverable from the upstream plan. Keep it concrete and short.",
      broadcast: false,
      humanGate: false,
      remember: true,
    },
  };
  const critic: GraphNode = {
    id: "agent-critic",
    type: "agent",
    position: { x: 820, y: 460 },
    data: {
      kind: "agent",
      name: "Critic",
      role: "Names a risk and a next step",
      systemPrompt: "You review the upstream message. Name one risk and one next step.",
      broadcast: false,
      humanGate: false,
      remember: false,
    },
  };
  return {
    nodes: [llm, planner, files, router, writer, critic],
    edges: [
      { id: "e-brain-planner", source: "llm-main", target: "agent-planner", sourceHandle: "brain", targetHandle: "brain", type: "mesh", data: { relation: "brain" } },
      { id: "e-brain-writer", source: "llm-main", target: "agent-writer", sourceHandle: "brain", targetHandle: "brain", type: "mesh", data: { relation: "brain" } },
      { id: "e-brain-critic", source: "llm-main", target: "agent-critic", sourceHandle: "brain", targetHandle: "brain", type: "mesh", data: { relation: "brain" } },
      { id: "e-tool-planner", source: "tool-files", target: "agent-planner", sourceHandle: "tool", targetHandle: "tool", type: "mesh", data: { relation: "tool" } },
      { id: "e-plan-route", source: "agent-planner", target: "router-intent", sourceHandle: "flow-out", targetHandle: "flow-in", type: "mesh", data: { relation: "flow" } },
      { id: "e-route-write", source: "router-intent", target: "agent-writer", sourceHandle: "write", targetHandle: "flow-in", type: "mesh", data: { relation: "flow" } },
      { id: "e-route-else", source: "router-intent", target: "agent-critic", sourceHandle: "else", targetHandle: "flow-in", type: "mesh", data: { relation: "flow" } },
    ],
  };
}

export function serializeGraph(nodes: GraphNode[], edges: GraphEdge[]): Graph {
  return {
    nodes: nodes.map(({ id: nodeId, type, position, data }) => ({ id: nodeId, type, position, data })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type ?? "mesh",
      data: { relation: relationOf(edge) },
    })),
  };
}

export function flowFingerprint(name: string, task: string, nodes: GraphNode[], edges: GraphEdge[]): string {
  return JSON.stringify({ name, task, graph: serializeGraph(nodes, edges) });
}

export type LocalModel = {
  id: string;
  label: string;
  format: string | null;
  quant: string | null;
  params: string | null;
  sizeBytes: number | null;
  loaded: boolean;
  maxContext: number | null;
  source: "lmstudio" | "file";
};

export type Hardware = {
  ramPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  gpuPercent: number | null;
};

export type EngineEvent =
  | { kind: "edge"; edgeId: string; active: boolean }
  | { kind: "node"; nodeId: string; status: "running" | "ok" | "error" | "idle"; detail?: string }
  | { kind: "token"; nodeId: string; text: string }
  | { kind: "metric"; nodeId: string; tps: number; ttftMs: number; hardware: Hardware }
  | { kind: "tool"; nodeId: string; server: string; state: "start" | "ok" | "error"; detail: string }
  | { kind: "wait"; nodeId: string; mode: "human" | "approval"; prompt: string; command?: string }
  | { kind: "log"; text: string }
  | { kind: "run"; status: "ok" | "error" | "cancelled"; detail?: string };

export type WaitRequest = {
  decision: "approve" | "reject" | "note";
  text: string;
};
