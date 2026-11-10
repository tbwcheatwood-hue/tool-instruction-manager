import type { Graph, GraphEdge, GraphNode } from "./mesh";

export type WorkflowPlatform = "langflow" | "flowise" | "n8n" | "tim" | "als" | "unknown";

export type ConversionSeverity = "ok" | "warning" | "unsupported";

export type ConversionLine = {
  severity: ConversionSeverity;
  message: string;
  sourceRef?: string;
};

export type WorkflowImportMeta = {
  source: WorkflowPlatform;
  originalName?: string;
  description?: string;
  importedAt: string;
  sourceNodeCount?: number;
  sourceEdgeCount?: number;
  notSemanticEquivalent: true;
};

export type GraphWithMeta = Graph & { meta?: WorkflowImportMeta };

export type ImportConversionResult = {
  ok: boolean;
  error?: string;
  name: string;
  graph?: GraphWithMeta;
  summary: ConversionLine[];
  detectedSource: WorkflowPlatform;
};

export type WorkflowSearchPlatform = "langflow" | "flowise" | "n8n";

export type WorkflowSearchHit = {
  platform: WorkflowSearchPlatform;
  name: string;
  description?: string;
  repository: string;
  path: string;
  htmlUrl: string;
  rawUrl: string;
  score?: number;
};

export type WorkflowSearchResponse = {
  platform: WorkflowSearchPlatform;
  query: string;
  results: WorkflowSearchHit[];
  incomplete?: string;
  providerNote?: string;
};

/** Redact credential-like strings from summaries (never echo user secrets). */
export function redactSecret(value: unknown): string {
  if (typeof value !== "string") return "[redacted]";
  const t = value.trim();
  if (t.length <= 8) return "[redacted]";
  return `${t.slice(0, 3)}…[redacted]`;
}

export function emptyGraph(): GraphWithMeta {
  return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
}
