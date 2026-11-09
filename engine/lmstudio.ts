import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { LocalModel } from "../shared/mesh";

const exec = promisify(execFile);

export type StudioSettings = {
  endpoint: string;
  modelsDir: string;
  workspaceDir: string;
  mcpBridgeUrl: string;
  token: string;
};

type ChatMessage = {
  role: string;
  content: string;
  tool_calls?: unknown;
  tool_call_id?: string;
};

export type StreamRequest = {
  endpoint: string;
  token: string;
  model: string;
  messages: ChatMessage[];
  tools?: unknown[];
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  signal: AbortSignal;
  onToken: (text: string) => void;
};

export type StreamResult = {
  text: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
  tps: number;
  ttftMs: number;
};

function headers(token: string): HeadersInit {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function listStudioModels(settings: StudioSettings): Promise<{ online: boolean; error: string; models: LocalModel[] }> {
  const models: LocalModel[] = [];
  let online = false;
  let error = "";
  try {
    const response = await fetch(`${settings.endpoint}/api/v1/models`, {
      headers: headers(settings.token),
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error(`LM Studio answered ${response.status}`);
    online = true;
    const body = (await response.json()) as { models?: unknown[] };
    for (const item of body.models ?? []) {
      const record = asRecord(item);
      if (!record || record.type === "embedding") continue;
      const quant = asRecord(record.quantization);
      const instances = Array.isArray(record.loaded_instances) ? record.loaded_instances : [];
      models.push({
        id: String(record.key ?? ""),
        label: String(record.display_name ?? record.key ?? "model"),
        format: record.format == null ? null : String(record.format),
        quant: quant?.name == null ? null : String(quant.name),
        params: record.params_string == null ? null : String(record.params_string),
        sizeBytes: typeof record.size_bytes === "number" ? record.size_bytes : null,
        loaded: instances.length > 0,
        maxContext: typeof record.max_context_length === "number" ? record.max_context_length : null,
        source: "lmstudio",
      });
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
    try {
      const response = await fetch(`${settings.endpoint}/v1/models`, {
        headers: headers(settings.token),
        signal: AbortSignal.timeout(2500),
      });
      if (response.ok) {
        online = true;
        error = "";
        const body = (await response.json()) as { data?: { id?: string }[] };
        for (const item of body.data ?? []) {
          if (!item.id) continue;
          models.push({
            id: item.id,
            label: item.id,
            format: null,
            quant: null,
            params: null,
            sizeBytes: null,
            loaded: true,
            maxContext: null,
            source: "lmstudio",
          });
        }
      }
    } catch (fallback) {
      error = fallback instanceof Error ? fallback.message : String(fallback);
    }
  }
  for (const file of scanGguf(settings.modelsDir)) {
    if (models.some((model) => model.id === file.id)) continue;
    models.push(file);
  }
  return { online, error, models: models.filter((model) => model.id) };
}

function scanGguf(extraDir: string): LocalModel[] {
  const roots = [extraDir, path.join(os.homedir(), ".lmstudio", "models"), path.join(os.homedir(), ".cache", "lm-studio", "models")].filter(Boolean);
  const found: LocalModel[] = [];
  for (const root of roots) {
    walk(root, 0, found);
    if (found.length >= 200) break;
  }
  return found;
}

function walk(dir: string, depth: number, found: LocalModel[]): void {
  if (depth > 5 || found.length >= 200 || !dir) return;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (found.length >= 200) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, depth + 1, found);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".gguf")) {
      let size: number | null = null;
      try {
        size = fs.statSync(full).size;
      } catch {
        size = null;
      }
      found.push({
        id: full,
        label: entry.name.replace(/\.gguf$/i, ""),
        format: "gguf",
        quant: null,
        params: null,
        sizeBytes: size,
        loaded: false,
        maxContext: null,
        source: "file",
      });
    }
  }
}

async function hasLms(): Promise<boolean> {
  try {
    await exec("lms", ["--help"], { timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

function gpuFlag(layersPercent: number): string {
  if (layersPercent <= 0) return "off";
  if (layersPercent >= 100) return "max";
  return (layersPercent / 100).toFixed(2);
}

export async function loadModel(
  settings: StudioSettings,
  model: string,
  gpuLayers: number,
  nCtx: number,
  threads: number,
): Promise<string> {
  if (!model.trim()) throw new Error("Choose a model first.");
  if (await hasLms()) {
    const { stdout, stderr } = await exec(
      "lms",
      ["load", model, "--gpu", gpuFlag(gpuLayers), "--context-length", String(nCtx)],
      { timeout: 180000 },
    );
    const note = `CPU threads (${threads}) stay with LM Studio's runtime; the CLI applies GPU offload and context.`;
    return `${(stdout || stderr || "Loaded with lms.").trim()}\n${note}`;
  }
  const payload: Record<string, unknown> = {
    model,
    context_length: nCtx,
    flash_attention: true,
    offload_kv_cache_to_gpu: gpuLayers > 0,
    echo_load_config: true,
    num_threads: threads,
  };
  let response = await fetch(`${settings.endpoint}/api/v1/models/load`, {
    method: "POST",
    headers: headers(settings.token),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    delete payload.num_threads;
    response = await fetch(`${settings.endpoint}/api/v1/models/load`, {
      method: "POST",
      headers: headers(settings.token),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    });
  }
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Load failed (${response.status})`);
  return text;
}

export async function unloadModel(settings: StudioSettings, model: string): Promise<string> {
  if (!model.trim()) throw new Error("Choose a model first.");
  if (await hasLms()) {
    const { stdout, stderr } = await exec("lms", ["unload", model], { timeout: 60000 });
    return (stdout || stderr || "Unloaded.").trim();
  }
  const response = await fetch(`${settings.endpoint}/api/v1/models/unload`, {
    method: "POST",
    headers: headers(settings.token),
    body: JSON.stringify({ instance_id: model }),
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Unload failed (${response.status})`);
  return text;
}

async function postChat(request: StreamRequest, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${request.endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: headers(request.token),
    signal: request.signal,
    body: JSON.stringify(body),
  });
}

export async function streamChat(request: StreamRequest): Promise<StreamResult> {
  const started = performance.now();
  let first: number | null = null;
  const response = await postChat(request, {
    model: request.model,
    messages: request.messages,
    tools: request.tools,
    temperature: request.temperature,
    top_p: request.topP,
    top_k: request.topK,
    repeat_penalty: request.repeatPenalty,
    stream: true,
    stream_options: { include_usage: true },
  });
  const chat = response.ok ? response : await postChat(request, {
    model: request.model,
    messages: request.messages,
    temperature: request.temperature,
    top_p: request.topP,
    stream: true,
  });
  if (!chat.ok || !chat.body) {
    const detail = await chat.text().catch(() => "");
    throw new Error(detail || `LM Studio is not answering at ${request.endpoint}. Start its local server.`);
  }
  const reader = chat.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const calls = new Map<number, { id: string; name: string; args: string }>();
  let reportedTps = 0;
  let reportedTtft = 0;
  let completionTokens = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const payload = line.trim().startsWith("data:") ? line.trim().slice(5).trim() : "";
      if (!payload || payload === "[DONE]") continue;
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      const stats = asRecord(json.stats);
      if (stats) {
        const tps = Number(stats.tokens_per_second ?? stats.tokensPerSecond);
        const ttft = Number(stats.time_to_first_token ?? stats.time_to_first_token_seconds);
        if (Number.isFinite(tps) && tps > 0) reportedTps = tps;
        if (Number.isFinite(ttft) && ttft > 0) reportedTtft = ttft < 20 ? ttft * 1000 : ttft;
      }
      const usage = asRecord(json.usage);
      if (usage && typeof usage.completion_tokens === "number") completionTokens = usage.completion_tokens;
      const choices = Array.isArray(json.choices) ? json.choices : [];
      const choice = asRecord(choices[0]);
      const delta = asRecord(choice?.delta);
      if (!delta) continue;
      const piece = typeof delta.content === "string" ? delta.content : typeof delta.reasoning_content === "string" ? delta.reasoning_content : "";
      if (piece) {
        if (first == null) first = performance.now();
        text += piece;
        request.onToken(piece);
      }
      const toolDeltas = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
      for (const call of toolDeltas) {
        const record = asRecord(call);
        if (!record) continue;
        const index = typeof record.index === "number" ? record.index : 0;
        const current = calls.get(index) ?? { id: "", name: "", args: "" };
        if (typeof record.id === "string") current.id = record.id;
        const fn = asRecord(record.function);
        if (typeof fn?.name === "string") current.name += fn.name;
        if (typeof fn?.arguments === "string") current.args += fn.arguments;
        calls.set(index, current);
      }
    }
  }
  const elapsed = Math.max(1, performance.now() - (first ?? started));
  const ttftMs = reportedTtft || (first == null ? 0 : Math.round(first - started));
  const tokens = completionTokens || Math.max(1, Math.round(text.length / 4));
  const tps = reportedTps || (first == null ? 0 : tokens / (elapsed / 1000));
  const toolCalls = [...calls.values()].map((call) => {
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(call.args || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      args = {};
    }
    return { id: call.id || crypto.randomUUID(), name: call.name, args };
  });
  return { text, toolCalls, tps: Math.round(tps * 10) / 10, ttftMs };
}
