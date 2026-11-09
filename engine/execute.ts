import {
  chooseRoute,
  entryNodes,
  linkedIds,
  parseToolCall,
  relationOf,
  type EngineEvent,
  type Graph,
  type GraphNode,
  type Hardware,
  type LlmData,
  type ToolData,
  type WaitRequest,
} from "../shared/mesh";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

export type CompleteResult = {
  text: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
  tps: number;
  ttftMs: number;
};

export type MeshDeps = {
  flowId: string;
  emit: (event: EngineEvent) => void;
  complete: (
    node: GraphNode,
    llm: LlmData,
    messages: ChatMessage[],
    tools: unknown[],
    onToken: (text: string) => void,
  ) => Promise<CompleteResult>;
  invokeTool: (node: GraphNode, tool: GraphNode, args: Record<string, unknown>) => Promise<string>;
  waitHuman: (nodeId: string, mode: "human" | "approval", prompt: string, command?: string) => Promise<WaitRequest>;
  hardware: () => Promise<Hardware>;
  recall: (agentId: string) => { role: string; content: string }[];
  remember: (agentId: string, role: string, content: string) => void;
  signal: AbortSignal;
};

const MAX_VISITS = 3;
const MAX_STEPS = 24;

type Delivery = { nodeId: string; text: string; via: string | null };
type NodeResult = { text: string; handle?: string };

function outgoing(graph: Graph, node: GraphNode, result: NodeResult): Delivery[] {
  let edges = graph.edges.filter((edge) => edge.source === node.id && relationOf(edge) === "flow");
  if (node.type === "router") edges = edges.filter((edge) => edge.sourceHandle === result.handle);
  const deliveries: Delivery[] = edges.map((edge) => ({ nodeId: edge.target, text: result.text, via: edge.id }));
  if (node.type === "agent" && node.data.kind === "agent" && node.data.broadcast) {
    const seen = new Set(deliveries.map((item) => item.nodeId));
    for (const edge of graph.edges) {
      if (edge.source !== node.id && edge.target !== node.id) continue;
      const otherId = edge.source === node.id ? edge.target : edge.source;
      if (otherId === node.id || seen.has(otherId)) continue;
      const other = graph.nodes.find((item) => item.id === otherId);
      if (other?.type !== "agent") continue;
      seen.add(otherId);
      deliveries.push({ nodeId: otherId, text: result.text, via: edge.id });
    }
  }
  return deliveries;
}

export async function runMesh(graph: Graph, input: string, deps: MeshDeps): Promise<"ok" | "error"> {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const starts = entryNodes(graph);
  if (starts.length === 0) throw new Error("The mesh has nowhere to start. Add an agent with no incoming flow edge.");
  const visits = new Map<string, number>();
  let wave: Delivery[] = starts.map((node) => ({ nodeId: node.id, text: input, via: null }));
  let steps = 0;
  let failed = false;
  while (wave.length) {
    if (deps.signal.aborted) throw new DOMException("The run was cancelled", "AbortError");
    if (steps >= MAX_STEPS) {
      deps.emit({ kind: "log", text: "Stopped at the step cap." });
      break;
    }
    const batch = wave;
    wave = [];
    steps += batch.length;
    const next = await Promise.all(
      batch.map(async (delivery) => {
        const count = (visits.get(delivery.nodeId) ?? 0) + 1;
        visits.set(delivery.nodeId, count);
        if (count > MAX_VISITS) {
          deps.emit({ kind: "log", text: `${delivery.nodeId} hit the visit cap.` });
          return [] as Delivery[];
        }
        const node = nodes.get(delivery.nodeId);
        if (!node) return [];
        if (delivery.via) deps.emit({ kind: "edge", edgeId: delivery.via, active: true });
        try {
          const result = await runNode(graph, node, delivery.text, deps);
          return outgoing(graph, node, result);
        } catch (cause) {
          if (deps.signal.aborted || (cause instanceof Error && cause.name === "AbortError")) throw cause;
          failed = true;
          const detail = cause instanceof Error ? cause.message : String(cause);
          deps.emit({ kind: "node", nodeId: node.id, status: "error", detail });
          deps.emit({ kind: "log", text: `${labelOf(node)} failed: ${detail}` });
          return [] as Delivery[];
        } finally {
          if (delivery.via) deps.emit({ kind: "edge", edgeId: delivery.via, active: false });
        }
      }),
    );
    wave = next.flat();
  }
  deps.emit({ kind: "run", status: failed ? "error" : "ok", detail: failed ? "One or more nodes failed." : "Mesh finished." });
  return failed ? "error" : "ok";
}

async function runNode(graph: Graph, node: GraphNode, input: string, deps: MeshDeps): Promise<NodeResult> {
  deps.emit({ kind: "node", nodeId: node.id, status: "running" });
  if (node.data.kind === "router") {
    const chosen = chooseRoute(node.data.routes, node.data.fallback, input);
    deps.emit({ kind: "log", text: `${node.data.name} routed through ${chosen.label}.` });
    deps.emit({ kind: "node", nodeId: node.id, status: "ok" });
    return { text: input, handle: chosen.handle };
  }
  if (node.data.kind === "tool") {
    const args = defaultToolArgs(node.data, input);
    deps.emit({ kind: "tool", nodeId: node.id, server: node.data.server, state: "start", detail: JSON.stringify(args) });
    const result = await deps.invokeTool(node, node, args);
    deps.emit({ kind: "tool", nodeId: node.id, server: node.data.server, state: "ok", detail: result.slice(0, 500) });
    deps.emit({ kind: "node", nodeId: node.id, status: "ok" });
    return { text: result };
  }
  if (node.data.kind === "llm") {
    const result = await speak(node, node.data, [{ role: "user", content: input }], [], deps, node.id);
    deps.emit({ kind: "node", nodeId: node.id, status: "ok" });
    return { text: result.text };
  }
  let text = input;
  if (node.data.humanGate) {
    const answer = await deps.waitHuman(node.id, "human", `${node.data.name} is waiting for a note.`);
    text = `${text}\n\nOperator: ${answer.text}`;
  }
  const brain = graph.nodes.find((item) => linkedIds(graph, node.id, "brain").includes(item.id) && item.data.kind === "llm");
  const toolNodes = linkedIds(graph, node.id, "tool")
    .map((id) => graph.nodes.find((item) => item.id === id))
    .filter((item): item is GraphNode => item?.data.kind === "tool");
  if (!brain || brain.data.kind !== "llm") {
    deps.emit({ kind: "log", text: `${node.data.name} has no brain linked, so the message was forwarded.` });
    deps.emit({ kind: "node", nodeId: node.id, status: "ok" });
    return { text };
  }
  if (!brain.data.model.trim()) throw new Error("Set a model on the linked LLM node.");
  const memory = node.data.remember ? deps.recall(node.id) : [];
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${node.data.systemPrompt}\nRole: ${node.data.role}\nWhen you need a connected tool, use the tool call or a line such as TOOL filesystem {"op":"list","path":"."}. Connected tools: ${toolNodes.map((item) => (item.data as ToolData).server).join(", ") || "none"}.`,
    },
    ...memory.map((item) => ({ role: item.role as ChatMessage["role"], content: item.content })),
    { role: "user", content: text },
  ];
  const tools = toolNodes.map((item) => toolSchema((item.data as ToolData).server));
  let final = text;
  for (let round = 0; round < 4; round += 1) {
    const turn = await speak(brain, brain.data, messages, tools, deps, node.id);
    const parsed = parseToolCall(turn.text);
    const pending = turn.toolCalls.length ? turn.toolCalls : parsed ? [{ id: crypto.randomUUID(), name: parsed.name, args: parsed.args }] : [];
    if (pending.length === 0) {
      final = turn.text.trim() || final;
      break;
    }
    messages.push({
      role: "assistant",
      content: turn.text,
      tool_calls: pending.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.args) },
      })),
    });
    for (const call of pending) {
      const tool = toolNodes.find((item) => (item.data as ToolData).server === call.name);
      if (!tool || tool.data.kind !== "tool") {
        const missing = `Tool ${call.name} is not connected to ${node.data.name}.`;
        messages.push({ role: "tool", tool_call_id: call.id, content: missing });
        deps.emit({ kind: "tool", nodeId: node.id, server: call.name, state: "error", detail: missing });
        final = missing;
        continue;
      }
      deps.emit({ kind: "tool", nodeId: node.id, server: tool.data.server, state: "start", detail: JSON.stringify(call.args) });
      const result = await deps.invokeTool(node, tool, call.args);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
      deps.emit({ kind: "tool", nodeId: node.id, server: tool.data.server, state: "ok", detail: result.slice(0, 500) });
      final = result;
    }
  }
  if (node.data.remember) {
    deps.remember(node.id, "user", text);
    deps.remember(node.id, "assistant", final);
  }
  deps.emit({ kind: "node", nodeId: node.id, status: "ok" });
  return { text: final };
}

async function speak(
  llmNode: GraphNode,
  llm: LlmData,
  messages: ChatMessage[],
  tools: unknown[],
  deps: MeshDeps,
  sinkId: string,
): Promise<CompleteResult> {
  const result = await deps.complete(llmNode, llm, messages, tools, (piece) => {
    deps.emit({ kind: "token", nodeId: sinkId, text: piece });
    if (sinkId !== llmNode.id) deps.emit({ kind: "token", nodeId: llmNode.id, text: piece });
  });
  const hardware = await deps.hardware();
  const metric = { kind: "metric" as const, tps: result.tps, ttftMs: result.ttftMs, hardware };
  deps.emit({ ...metric, nodeId: sinkId });
  if (sinkId !== llmNode.id) deps.emit({ ...metric, nodeId: llmNode.id });
  return result;
}

function toolSchema(name: string): unknown {
  return {
    type: "function",
    function: {
      name,
      description: `Local ${name} tool.`,
      parameters: {
        type: "object",
        properties: {
          op: { type: "string" },
          path: { type: "string" },
          content: { type: "string" },
          command: { type: "string" },
          sql: { type: "string" },
          q: { type: "string" },
          url: { type: "string" },
          tool: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  };
}

function defaultToolArgs(data: ToolData, input: string): Record<string, unknown> {
  if (data.server === "filesystem") return { op: "list", path: "." };
  if (data.server === "workspace_info") return {};
  if (data.server === "git") return { op: "status" };
  if (data.server === "sqlite") return { sql: "SELECT agent_id, role, content, created_at FROM memories ORDER BY created_at DESC LIMIT 8" };
  if (data.server === "memory") return { limit: 12 };
  if (data.server === "web_search") return { q: input.slice(0, 300) };
  if (data.server === "fetch_url") return { url: "https://example.com" };
  if (data.server === "mcp_bridge") return { tool: "ping", message: input.slice(0, 300) };
  return { command: input };
}

function labelOf(node: GraphNode): string {
  if (node.data.kind === "agent") return node.data.name;
  if (node.data.kind === "llm") return node.data.model || "LLM";
  if (node.data.kind === "tool") return node.data.label;
  return node.data.name;
}
