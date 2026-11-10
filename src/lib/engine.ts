import type { FlowRecord, Hardware, LocalModel } from "../../shared/mesh";

const configured = (process.env.NEXT_PUBLIC_ENGINE ?? "http://127.0.0.1:8791").replace(/\/$/, "");

/** HTTP base: absolute URL in dev, or same-origin path prefix e.g. /tim when consolidated. */
export const ENGINE_BASE = configured;

export const ENGINE_WS =
  process.env.NEXT_PUBLIC_ENGINE_WS ??
  (ENGINE_BASE.startsWith("/")
    ? "ws://127.0.0.1:8791/ws"
    : `${ENGINE_BASE.replace(/^http/, "ws")}/ws`);

function engineUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (ENGINE_BASE.startsWith("http")) {
    return `${ENGINE_BASE}${p}`;
  }
  const prefix = ENGINE_BASE || "/tim";
  return `${prefix}${p}`;
}

export async function engineFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(engineUrl(path), {
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
