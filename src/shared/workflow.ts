import { WORKFLOW_VERSION, type NodeKind, type Workflow, type WorkflowEdge, type WorkflowNode } from "./types";

const KINDS = new Set<NodeKind>(["input", "agent", "tool", "branch", "reviewer", "output"]);

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export function defaultConfig(kind: NodeKind): Record<string, unknown> {
  switch (kind) {
    case "agent":
      return {
        name: "Agent",
        role: "assistant",
        systemPrompt:
          "Complete only the assigned step. Do not claim the task is complete unless supporting artifacts exist.",
        providerId: "simulated",
        model: "",
        temperature: 0.2,
        claim: "",
      };
    case "tool":
      return {
        tool: "write_artifact",
        artifactName: "report",
        contentTemplate: "{{input}}",
        path: "",
        separator: "\n",
        delayMs: 40,
        note: "",
      };
    case "branch":
      return { mode: "contains", value: "", path: "" };
    case "reviewer":
      return { requiredArtifacts: ["report"], requireArtifactOnCompletion: true };
    case "input":
      return { defaultValue: "" };
    default:
      return {};
  }
}

export function defaultLabel(kind: NodeKind): string {
  switch (kind) {
    case "input":
      return "Input";
    case "agent":
      return "Agent";
    case "tool":
      return "Tool";
    case "branch":
      return "Branch";
    case "reviewer":
      return "Reviewer";
    case "output":
      return "Output";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPosition(value: unknown): { x: number; y: number } {
  if (!isRecord(value)) return { x: 0, y: 0 };
  const x = Number(value.x);
  const y = Number(value.y);
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

export function parseWorkflow(raw: unknown): Workflow {
  if (!isRecord(raw)) throw new WorkflowError("Workflow must be a JSON object");
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Untitled workflow";
  const id = typeof raw.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(raw.id) ? raw.id : "";
  if (!Array.isArray(raw.nodes)) throw new WorkflowError("Workflow is missing a nodes array");
  if (!Array.isArray(raw.edges)) throw new WorkflowError("Workflow is missing an edges array");

  const nodes: WorkflowNode[] = raw.nodes.map((node, index) => {
    if (!isRecord(node)) throw new WorkflowError(`Node ${index} is not an object`);
    const kind = node.kind;
    if (typeof kind !== "string" || !KINDS.has(kind as NodeKind)) {
      throw new WorkflowError(`Node ${index} has an unknown kind`);
    }
    const nodeId = typeof node.id === "string" && node.id.trim() ? node.id.trim() : `node-${index + 1}`;
    const label = typeof node.label === "string" && node.label.trim() ? node.label.trim() : defaultLabel(kind as NodeKind);
    const config = isRecord(node.config) ? { ...defaultConfig(kind as NodeKind), ...node.config } : defaultConfig(kind as NodeKind);
    return { id: nodeId, kind: kind as NodeKind, label, position: readPosition(node.position), config };
  });

  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new WorkflowError(`Duplicate node id: ${node.id}`);
    ids.add(node.id);
  }

  const edges: WorkflowEdge[] = raw.edges.map((edge, index) => {
    if (!isRecord(edge)) throw new WorkflowError(`Edge ${index} is not an object`);
    const source = typeof edge.source === "string" ? edge.source : "";
    const target = typeof edge.target === "string" ? edge.target : "";
    if (!ids.has(source) || !ids.has(target)) throw new WorkflowError(`Edge ${index} references a missing node`);
    if (source === target) throw new WorkflowError(`Edge ${index} connects a node to itself`);
    const sourceHandle = typeof edge.sourceHandle === "string" ? edge.sourceHandle : undefined;
    const edgeId = typeof edge.id === "string" && edge.id.trim() ? edge.id.trim() : `edge-${index + 1}`;
    return { id: edgeId, source, target, sourceHandle };
  });

  return {
    id,
    name,
    version: WORKFLOW_VERSION,
    nodes,
    edges,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function findCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) adj.get(edge.source)?.push(edge.target);
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    color.set(id, 1);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      const state = color.get(next) ?? 0;
      if (state === 1) return stack.slice(stack.indexOf(next));
      if (state === 0) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, 2);
    return null;
  };

  for (const node of nodes) {
    if ((color.get(node.id) ?? 0) === 0) {
      const found = visit(node.id);
      if (found) return found;
    }
  }
  return null;
}
