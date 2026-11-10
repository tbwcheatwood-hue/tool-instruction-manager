import type { ConversionLine, GraphWithMeta } from "./workflowImport";

/** ALS routing-chart workflow (pipelines slot). */
export type AlsRoutingEdge = {
  id: string;
  from: string;
  to: string;
  mode: "serial" | "parallel";
  label?: string;
};

export type AlsAttachment = {
  name: string;
  bytes: number;
  text: string;
};

export type AlsRoutingNode = {
  id: string;
  type: "agent" | "parallel" | "merge" | "checkpoint" | "loop" | "delay" | "end";
  x: number;
  y: number;
  isolation?: boolean;
  label?: string;
  agentId?: string | null;
  attachments?: AlsAttachment[];
  num?: number;
  loops?: number;
  delayMode?: "after" | "at";
  delayH?: number;
  delayM?: number;
  delayS?: number;
  delayAt?: string;
  delayEveryLap?: boolean;
};

export type AlsPipeline = {
  id: string;
  name: string;
  nodes: AlsRoutingNode[];
  edges: AlsRoutingEdge[];
  viewport?: { x: number; y: number; scale: number };
  snapGrid?: boolean;
};

export type AlsAgent = {
  id: string;
  code?: string;
  name: string;
  role?: string;
  systemPrompt?: string;
  provider?: string;
  model?: string;
  active?: boolean;
  temperature?: number;
  maxTokens?: number;
  tools?: unknown;
};

export type AlsAgentDraft = {
  name: string;
  role?: string;
  systemPrompt?: string;
  modelHint?: string;
};

export type AlsAgentsTouch = {
  matched: string[];
  created: string[];
};

export type AlsBridgeResult = {
  ok: boolean;
  error?: string;
  name: string;
  summary: ConversionLine[];
  pipeline?: AlsPipeline;
  graph?: GraphWithMeta;
  agentsTouched?: AlsAgentsTouch;
  pipelineId?: string;
};

export type AlsPipelineSummary = {
  id: string;
  name: string;
};
