import type { FlowRecord, Hardware, LocalModel } from "../../shared/mesh";

export const ENGINE_HTTP = process.env.NEXT_PUBLIC_ENGINE ?? "http://127.0.0.1:8791";
export const ENGINE_WS = `${ENGINE_HTTP.replace(/^http/, "ws")}/ws`;

export async function engineFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ENGINE_HTTP}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T);
  if (!response.ok) throw new Error((body as { error?: string }).error || response.statusText);
  return body;
}

export type Settings = {
  lmStudioUrl: string;
  modelsDir: string;
  workspaceDir: string;
  mcpBridgeUrl: string;
  alsRoot: string;
  alsApiUrl: string;
};

export type ModelResponse = {
  online: boolean;
  error: string;
  models: LocalModel[];
};

export type { FlowRecord, Hardware, LocalModel };
