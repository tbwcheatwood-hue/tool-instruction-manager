import fs from "node:fs";
import path from "node:path";
import type { AlsAgent, AlsAgentDraft, AlsAgentsTouch, AlsPipeline, AlsPipelineSummary } from "../shared/alsRouting";
import type { AlsPaths } from "./alsProviders";

export type AlsStateBundle = {
  rev?: number;
  updated?: number;
  slots?: {
    agents?: AlsAgent[];
    pipelines?: AlsPipeline[];
    providers?: unknown[];
    settings?: Record<string, unknown>;
    [key: string]: unknown;
  };
};

function writeAlsState(paths: AlsPaths, state: AlsStateBundle): void {
  state.rev = (state.rev ?? 0) + 1;
  state.updated = Math.floor(Date.now() / 1000);
  const json = JSON.stringify(state, null, 2);
  fs.mkdirSync(path.dirname(paths.stateFile), { recursive: true });
  const tmp = `${paths.stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, paths.stateFile);
}

export function readAlsState(paths: AlsPaths): { state: AlsStateBundle | null; error?: string } {
  if (!fs.existsSync(paths.root)) {
    return { state: null, error: `ALS root not found: ${paths.root}` };
  }
  if (!fs.existsSync(paths.stateFile)) {
    return { state: { rev: 0, slots: {} } };
  }
  try {
    const state = JSON.parse(fs.readFileSync(paths.stateFile, "utf8")) as AlsStateBundle;
    return { state };
  } catch {
    return { state: null, error: "Could not parse storage/state.json" };
  }
}

export function listAlsPipelines(paths: AlsPaths): { pipelines: AlsPipelineSummary[]; error?: string } {
  const { state, error } = readAlsState(paths);
  if (error && !state) return { pipelines: [], error };
  const list = Array.isArray(state?.slots?.pipelines) ? state!.slots!.pipelines! : [];
  return {
    pipelines: list.map((p) => ({ id: p.id, name: p.name || "Untitled workflow" })),
    error,
  };
}

export function getAlsPipeline(paths: AlsPaths, pipelineId: string): { pipeline?: AlsPipeline; error?: string } {
  const { state, error } = readAlsState(paths);
  if (error || !state) return { error: error || "No ALS state" };
  const list = Array.isArray(state.slots?.pipelines) ? state.slots!.pipelines! : [];
  const pipeline = list.find((p) => p.id === pipelineId);
  if (!pipeline) return { error: `Pipeline not found: ${pipelineId}` };
  return { pipeline };
}

export function mergePipeline(paths: AlsPaths, pipeline: AlsPipeline, replaceId?: string): { error?: string } {
  const { state, error } = readAlsState(paths);
  if (error || !state) return { error: error || "No ALS state" };
  if (!state.slots) state.slots = {};
  if (!Array.isArray(state.slots.pipelines)) state.slots.pipelines = [];
  const pipelines = state.slots.pipelines;
  const upsertId = replaceId || pipeline.id;
  const idx = pipelines.findIndex((p) => p.id === upsertId);
  const next = { ...pipeline, id: upsertId };
  if (idx >= 0) pipelines[idx] = next;
  else pipelines.push(next);
  writeAlsState(paths, state);
  return {};
}

function agentCode(): string {
  return `A${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function defaultProviderModel(state: AlsStateBundle): { provider: string; model: string } {
  const providers = Array.isArray(state.slots?.providers) ? state.slots!.providers! : [];
  for (const raw of providers) {
    const p = raw as { id?: string; models?: string[]; active?: boolean };
    if (p.active && Array.isArray(p.models) && p.models[0]) {
      return { provider: p.id || "default", model: p.models[0] };
    }
  }
  for (const raw of providers) {
    const p = raw as { id?: string; models?: string[] };
    if (Array.isArray(p.models) && p.models[0]) {
      return { provider: p.id || "default", model: p.models[0] };
    }
  }
  return { provider: "default", model: "" };
}

export function ensureAgents(paths: AlsPaths, drafts: AlsAgentDraft[]): { agents: AlsAgent[]; touch: AlsAgentsTouch; error?: string } {
  const touch: AlsAgentsTouch = { matched: [], created: [] };
  const { state, error } = readAlsState(paths);
  if (error || !state) return { agents: [], touch, error: error || "No ALS state" };
  if (!state.slots) state.slots = {};
  if (!Array.isArray(state.slots.agents)) state.slots.agents = [];
  const agents = state.slots.agents;
  const defaults = defaultProviderModel(state);
  let changed = false;

  const byName = new Map<string, AlsAgent>();
  for (const a of agents) {
    if (a?.name) byName.set(a.name.trim().toLowerCase(), a);
  }

  for (const draft of drafts) {
    const key = draft.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      touch.matched.push(existing.name);
      continue;
    }
    const created: AlsAgent = {
      id: `agent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      code: agentCode(),
      name: draft.name.trim() || "Agent",
      role: draft.role?.trim() || "Collaborator",
      systemPrompt: draft.systemPrompt?.trim() || "",
      provider: defaults.provider,
      model: draft.modelHint?.trim() || defaults.model,
      active: true,
      temperature: 1,
      maxTokens: 16384,
      tools: [],
    };
    agents.push(created);
    byName.set(key, created);
    touch.created.push(created.name);
    changed = true;
  }

  if (changed) writeAlsState(paths, state);
  return { agents, touch };
}

export function resolveAgentIdByName(agents: AlsAgent[], name: string): string | null {
  const key = name.trim().toLowerCase();
  const found = agents.find((a) => a.name.trim().toLowerCase() === key);
  return found?.id ?? null;
}
