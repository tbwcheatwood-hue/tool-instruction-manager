export const WORKFLOW_VERSION = 1 as const;

export type NodeKind = "input" | "agent" | "tool" | "branch" | "reviewer" | "output";

export type ProviderKind = "simulated" | "openai-compatible";

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  position: { x: number; y: number };
  label: string;
  config: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface Workflow {
  id: string;
  name: string;
  version: typeof WORKFLOW_VERSION;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  updatedAt: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface ProviderPublic extends Omit<ProviderConfig, "apiKey"> {
  hasApiKey: boolean;
}

export interface Artifact {
  name: string;
  content: string;
  producedBy: string;
}

export type RunStatus = "running" | "ok" | "error" | "rejected";

export type NodeStatus = "pending" | "running" | "ok" | "error" | "skipped" | "rejected";

export interface RunEvent {
  seq: number;
  nodeId: string;
  kind: "node_start" | "node_end" | "tool_call" | "model_response" | "error" | "artifact" | "review";
  status?: NodeStatus | RunStatus;
  at: string;
  payload: unknown;
}

export interface NodeResult {
  status: NodeStatus;
  output?: unknown;
  error?: string;
}

export interface RunResult {
  id: string;
  workflowId: string;
  workflowName: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  input: unknown;
  events: RunEvent[];
  artifacts: Artifact[];
  nodeResults: Record<string, NodeResult>;
  output: unknown;
  error?: string;
}
