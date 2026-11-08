import type { Artifact, NodeResult, NodeStatus, ProviderConfig, RunEvent, RunStatus, Workflow, WorkflowEdge, WorkflowNode } from "../shared/types";
import { WorkflowError, findCycle } from "../shared/workflow";
import { callOpenAICompatible, resolveProvider, type FetchLike } from "./providers";
import { reviewClaim } from "./reviewer";
import { asText, asStringList, lookup, textOfOutput } from "./text";
import { runTool, type ToolInput } from "./tools";

export interface StudioRelayRequest {
  providerId: string;
  prompt: string;
  temperature: number;
}

export interface ExecuteOptions {
  input: unknown;
  providers: ProviderConfig[];
  fetchImpl?: FetchLike;
  studioRelay?: (request: StudioRelayRequest) => Promise<{ text: string; via: "simulated" | "studio" }>;
  events?: RunEvent[];
  onEvent?: (event: RunEvent) => void;
  trace?: string[];
}

interface Upstream {
  nodeId: string;
  label: string;
  output: unknown;
}

const TERMINAL = new Set<NodeStatus>(["ok", "error", "skipped", "rejected"]);

function ancestorsOf(id: string, incoming: Map<string, WorkflowEdge[]>): Set<string> {
  const seen = new Set<string>();
  const stack = (incoming.get(id) ?? []).map((edge) => edge.source);
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const edge of incoming.get(current) ?? []) stack.push(edge.source);
  }
  return seen;
}

function chooseBranch(node: WorkflowNode, merged: { text: string; upstream: Upstream[] }): "pass" | "fail" {
  const mode = String(node.config.mode ?? "contains");
  const path = String(node.config.path ?? "");
  const expected = String(node.config.value ?? "");
  const target = path ? lookup(merged, path) : mode === "json_truthy" ? merged.text : merged;
  const haystack = asText(target);
  if (mode === "equals") return haystack.trim() === expected ? "pass" : "fail";
  if (mode === "regex") {
    let expression: RegExp;
    try {
      expression = new RegExp(expected);
    } catch {
      throw new Error(`Invalid branch regular expression: ${expected}`);
    }
    return expression.test(haystack) ? "pass" : "fail";
  }
  if (mode === "json_truthy") return target ? "pass" : "fail";
  return haystack.includes(expected) ? "pass" : "fail";
}

export async function executeWorkflow(workflow: Workflow, options: ExecuteOptions) {
  if (workflow.nodes.length === 0) throw new WorkflowError("Workflow has no nodes");
  const cycle = findCycle(workflow.nodes, workflow.edges);
  if (cycle) throw new WorkflowError(`Workflow contains a cycle: ${cycle.join(" -> ")}`);

  const events = options.events ?? [];
  const trace = options.trace;
  let seq = 0;
  const push = (event: Omit<RunEvent, "seq" | "at">) => {
    const stored: RunEvent = { ...event, seq: ++seq, at: new Date().toISOString() };
    events.push(stored);
    options.onEvent?.(stored);
  };

  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, WorkflowEdge[]>();
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const node of workflow.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of workflow.edges) {
    incoming.get(edge.target)?.push(edge);
    outgoing.get(edge.source)?.push(edge);
  }

  const state = new Map<string, NodeStatus>(workflow.nodes.map((node) => [node.id, "pending"]));
  const results = new Map<string, unknown>();
  const nodeResults: Record<string, NodeResult> = {};
  const edgeActive = new Map<string, boolean>();
  const artifacts = new Map<string, Artifact>();

  const deactivate = (nodeId: string) => {
    for (const edge of outgoing.get(nodeId) ?? []) edgeActive.set(edge.id, false);
  };

  const activate = (node: WorkflowNode, handle?: string) => {
    for (const edge of outgoing.get(node.id) ?? []) {
      if (node.kind === "branch") edgeActive.set(edge.id, edge.sourceHandle === handle);
      else edgeActive.set(edge.id, true);
    }
  };

  const finish = (node: WorkflowNode, status: NodeStatus, output?: unknown, error?: string) => {
    state.set(node.id, status);
    if (output !== undefined) results.set(node.id, output);
    nodeResults[node.id] = { status, output, error };
    if (status === "error" || status === "skipped") deactivate(node.id);
    push({
      nodeId: node.id,
      kind: status === "error" ? "error" : "node_end",
      status,
      payload: error ? { error, output } : { output },
    });
  };

  const activeInputs = (nodeId: string): Upstream[] => {
    const items: Upstream[] = [];
    for (const edge of incoming.get(nodeId) ?? []) {
      if (!edgeActive.get(edge.id)) continue;
      const source = byId.get(edge.source);
      items.push({
        nodeId: edge.source,
        label: source?.label ?? edge.source,
        output: results.get(edge.source),
      });
    }
    return items;
  };

  const runNode = async (node: WorkflowNode) => {
    trace?.push(`start:${node.id}`);
    state.set(node.id, "running");
    push({ nodeId: node.id, kind: "node_start", status: "running", payload: { kind: node.kind, label: node.label } });
    const inputs = activeInputs(node.id);
    const merged = {
      upstream: inputs,
      text: inputs.map((item) => textOfOutput(item.output)).join("\n"),
    };

    try {
      if (node.kind === "input") {
        let output = options.input;
        if (output && typeof output === "object" && !Array.isArray(output) && node.id in output) {
          output = (output as Record<string, unknown>)[node.id];
        } else if (output === undefined) {
          output = node.config.defaultValue ?? "";
        }
        activate(node);
        finish(node, "ok", output);
        return;
      }

      if (node.kind === "output") {
        const output = { upstream: inputs };
        activate(node);
        finish(node, "ok", output);
        return;
      }

      if (node.kind === "tool") {
        const toolName = String(node.config.tool ?? "echo");
        push({ nodeId: node.id, kind: "tool_call", status: "running", payload: { tool: toolName, input: merged.text } });
        if (toolName === "studio_relay") {
          if (!options.studioRelay) throw new Error("Studio relay is not configured on this server");
          const providerId = String(node.config.providerId ?? "simulated");
          const relayed = await options.studioRelay({
            providerId,
            prompt: merged.text,
            temperature: Number(node.config.temperature ?? 0.2),
          });
          const output = { text: relayed.text, tool: "studio_relay", via: relayed.via, providerId };
          activate(node);
          finish(node, "ok", output);
          return;
        }
        const toolInputs: ToolInput[] = inputs;
        const ran = await runTool({ node, inputs: toolInputs, artifacts });
        for (const artifact of ran.artifactsWritten) {
          push({ nodeId: node.id, kind: "artifact", status: "ok", payload: artifact });
        }
        activate(node);
        finish(node, "ok", ran.output);
        return;
      }

      if (node.kind === "branch") {
        const handle = chooseBranch(node, merged);
        const output = { handle, matched: handle === "pass", text: merged.text };
        activate(node, handle);
        finish(node, "ok", output);
        return;
      }

      if (node.kind === "agent") {
        const provider = resolveProvider(options.providers, String(node.config.providerId ?? "simulated"));
        const name = String(node.config.name ?? node.label);
        const role = String(node.config.role ?? "assistant");
        const systemPrompt = String(node.config.systemPrompt ?? "");
        const ancestorIds = ancestorsOf(node.id, incoming);
        const visibleArtifacts = [...artifacts.values()].filter((artifact) => ancestorIds.has(artifact.producedBy));
        const system = `You are ${name}, role: ${role}.\n${systemPrompt}\nUse only the upstream material. Do not claim the task is complete unless the listed artifacts exist.`;
        const user = asText({ upstream: inputs, artifacts: visibleArtifacts.map((artifact) => artifact.name) });

        let text: string;
        let simulated = false;
        let model = provider.model ?? "";
        if (provider.kind === "simulated") {
          simulated = true;
          model = "simulated";
          text = `[simulated] ${name} (${role}) drafted a response from the upstream input.`;
          const claim = String(node.config.claim ?? "").trim();
          if (claim) text = `${text}\n${claim}`;
        } else {
          const called = await callOpenAICompatible({
            provider,
            model: String(node.config.model ?? ""),
            temperature: Number(node.config.temperature ?? 0.2),
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            fetchImpl: options.fetchImpl ?? fetch,
          });
          text = called.text;
          model = String(node.config.model || provider.model || "");
        }

        const output = {
          text,
          simulated,
          providerId: provider.id,
          providerKind: provider.kind,
          model,
          agent: name,
        };
        push({
          nodeId: node.id,
          kind: "model_response",
          status: "ok",
          payload: { simulated, providerId: provider.id, providerKind: provider.kind, model, text },
        });
        activate(node);
        finish(node, "ok", output);
        return;
      }

      if (node.kind === "reviewer") {
        const ancestorIds = ancestorsOf(node.id, incoming);
        const visible = [...artifacts.values()].filter((artifact) => ancestorIds.has(artifact.producedBy));
        const verdict = reviewClaim({
          texts: inputs.map((item) => textOfOutput(item.output)),
          artifacts: visible,
          required: asStringList(node.config.requiredArtifacts),
          requireArtifactOnCompletion: node.config.requireArtifactOnCompletion !== false,
        });
        const status: NodeStatus = verdict.verdict === "reject" ? "rejected" : "ok";
        const output = { ...verdict, artifacts: visible.map((artifact) => artifact.name) };
        push({ nodeId: node.id, kind: "review", status, payload: output });
        activate(node);
        finish(node, status, output);
        return;
      }

      throw new Error(`Unsupported node kind`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finish(node, "error", undefined, message);
    } finally {
      trace?.push(`end:${node.id}`);
    }
  };

  const predecessorsDone = (nodeId: string) => (incoming.get(nodeId) ?? []).every((edge) => TERMINAL.has(state.get(edge.source) ?? "pending"));
  const shouldSkip = (nodeId: string) => {
    const edges = incoming.get(nodeId) ?? [];
    return edges.length > 0 && edges.every((edge) => edgeActive.get(edge.id) === false);
  };

  while (workflow.nodes.some((node) => state.get(node.id) === "pending")) {
    const ready = workflow.nodes.filter((node) => state.get(node.id) === "pending" && predecessorsDone(node.id));
    if (ready.length === 0) {
      const stuck = workflow.nodes.filter((node) => state.get(node.id) === "pending").map((node) => node.id);
      throw new WorkflowError(`Workflow could not make progress. Blocked nodes: ${stuck.join(", ")}`);
    }
    await Promise.all(
      ready.map(async (node) => {
        if (shouldSkip(node.id)) {
          trace?.push(`start:${node.id}`);
          push({ nodeId: node.id, kind: "node_start", status: "skipped", payload: { kind: node.kind, label: node.label } });
          finish(node, "skipped", { skipped: true });
          trace?.push(`end:${node.id}`);
          return;
        }
        await runNode(node);
      }),
    );
  }

  const statuses = Object.values(nodeResults).map((result) => result.status);
  const status: RunStatus = statuses.includes("error") ? "error" : statuses.includes("rejected") ? "rejected" : "ok";
  const outputNodes = workflow.nodes.filter((node) => node.kind === "output");
  const output = outputNodes.length
    ? outputNodes.map((node) => ({ nodeId: node.id, output: results.get(node.id) }))
    : workflow.nodes
        .filter((node) => (outgoing.get(node.id) ?? []).length === 0)
        .map((node) => ({ nodeId: node.id, output: results.get(node.id) }));

  return {
    status,
    events,
    artifacts: [...artifacts.values()],
    nodeResults,
    output,
  };
}
