import fs from "node:fs";
import path from "node:path";
import type { AlsCleanupResult, AlsRegisterResult, DiscoveredService } from "../shared/connections";

export type AlsPaths = {
  root: string;
  stateFile: string;
};

export function resolveAlsPaths(root: string): AlsPaths {
  const normalized = path.resolve(root);
  return { root: normalized, stateFile: path.join(normalized, "storage", "state.json") };
}

type AlsProvider = {
  id: string;
  name: string;
  endpoint: string;
  apiKey?: string;
  models: string[];
  authType?: string;
  active?: boolean;
};

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}

function endpointForChat(service: DiscoveredService): string {
  if (service.serverKind === "ollama") {
    const root = service.baseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
    return `${root}/api/chat`;
  }
  return normalizeChatEndpoint(`${service.baseUrl.replace(/\/$/, "")}/chat/completions`);
}

export function normalizeChatEndpoint(endpoint: string): string {
  const raw = endpoint.trim();
  if (!raw) return raw;
  if (/\/api\/chat\/?$/i.test(raw)) return raw.replace(/\/$/, "");
  if (/\/chat\/completions\/?$/i.test(raw)) return raw.replace(/\/$/, "");
  const trimmed = raw.replace(/\/$/, "");
  if (/\/paas\/v\d+$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return trimmed;
}

function isLoopbackOrLan(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
    if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
  } catch {
    return false;
  }
  return false;
}

function repairProvider(provider: AlsProvider): AlsProvider {
  const endpoint = normalizeChatEndpoint(provider.endpoint);
  const next: AlsProvider = { ...provider, endpoint };
  if (isLoopbackOrLan(endpoint)) {
    next.authType = "none";
    if (!String(next.apiKey ?? "").trim()) next.apiKey = "local";
  }
  return next;
}

function providerFromService(service: DiscoveredService): AlsProvider {
  const id = `tim_${slug(`${service.ip}_${service.port}_${service.serverKind}`)}`;
  const endpoint = endpointForChat(service);
  const local = isLoopbackOrLan(endpoint) || service.ip === "127.0.0.1" || service.ip.startsWith("192.168.");
  return {
    id,
    name: `${service.serverKind} @ ${service.ip}:${service.port}`,
    endpoint,
    apiKey: local ? "local" : "",
    models: service.models.length ? service.models.slice(0, 20) : service.loadedModel ? [service.loadedModel] : [],
    authType: local ? "none" : "bearer",
    active: false,
  };
}

function isGatewayOpenAiCompatBogus(provider: AlsProvider): boolean {
  if (!/openai_compat|:8080\b/i.test(provider.name)) return false;
  const models = provider.models ?? [];
  if (models.length > 0) return false;
  try {
    const url = new URL(provider.endpoint.replace(/\/chat\/completions$/, "/v1/models"));
    const host = url.hostname;
    const parts = host.split(".").map((p) => Number(p));
    if (parts.length === 4 && parts.every((n) => !Number.isNaN(n)) && parts[3] === 1) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function cleanupReason(provider: AlsProvider): string | null {
  const models = provider.models ?? [];
  if (models.length === 0) {
    return "no models listed";
  }
  if (isGatewayOpenAiCompatBogus(provider)) {
    return "gateway/router false positive";
  }
  return null;
}

function writeAlsState(paths: AlsPaths, state: { rev?: number; slots?: { providers?: AlsProvider[] } }): AlsCleanupResult | void {
  state.rev = (state.rev ?? 0) + 1;
  const json = JSON.stringify({ ...state, updated: Math.floor(Date.now() / 1000) }, null, 2);
  fs.mkdirSync(path.dirname(paths.stateFile), { recursive: true });
  const tmp = `${paths.stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, paths.stateFile);
}

export function cleanupAlsProviders(paths: AlsPaths): AlsCleanupResult {
  const removed: string[] = [];
  if (!fs.existsSync(paths.root)) {
    return { removed, kept: 0, error: `ALS root not found: ${paths.root}` };
  }
  if (!fs.existsSync(paths.stateFile)) {
    return { removed, kept: 0 };
  }
  let state: { rev?: number; slots?: { providers?: AlsProvider[] } };
  try {
    state = JSON.parse(fs.readFileSync(paths.stateFile, "utf8")) as typeof state;
  } catch {
    return { removed, kept: 0, error: "Could not parse storage/state.json" };
  }
  const providers = Array.isArray(state.slots?.providers) ? state.slots!.providers! : [];
  const kept: AlsProvider[] = [];
  const seenEndpoints = new Set<string>();
  let repaired = false;
  for (const provider of providers) {
    const reason = cleanupReason(provider);
    if (reason) {
      removed.push(`${provider.name} (${reason})`);
      continue;
    }
    const fixed = repairProvider(provider);
    if (fixed.endpoint !== provider.endpoint || fixed.authType !== provider.authType || fixed.apiKey !== provider.apiKey) {
      repaired = true;
    }
    const endpointKey = fixed.endpoint.trim().toLowerCase();
    if (seenEndpoints.has(endpointKey)) {
      removed.push(`${provider.name} (duplicate endpoint)`);
      continue;
    }
    seenEndpoints.add(endpointKey);
    kept.push(fixed);
  }
  if (removed.length > 0 || repaired) {
    if (!state.slots) state.slots = {};
    state.slots.providers = kept;
    writeAlsState(paths, state);
  }
  return { removed, kept: kept.length };
}

export function registerServicesInAls(paths: AlsPaths, services: DiscoveredService[]): AlsRegisterResult {
  const cleanup = cleanupAlsProviders(paths);
  const added: string[] = [];
  const skipped: string[] = [];
  if (!fs.existsSync(paths.root)) {
    return { added, skipped, cleanup, error: `ALS root not found: ${paths.root}` };
  }
  let state: { rev?: number; slots?: { providers?: AlsProvider[] } } = {};
  if (fs.existsSync(paths.stateFile)) {
    try {
      state = JSON.parse(fs.readFileSync(paths.stateFile, "utf8")) as typeof state;
    } catch {
      return { added, skipped, cleanup, error: "Could not parse storage/state.json" };
    }
  } else {
    state = { rev: 0, slots: {} };
  }
  if (!state.slots) state.slots = {};
  if (!Array.isArray(state.slots.providers)) state.slots.providers = [];
  const providers = state.slots.providers;
  for (const service of services) {
    if (service.models.length === 0 && !service.loadedModel) {
      skipped.push(`${service.ip}:${service.port} (no models listed)`);
      continue;
    }
    if (!service.reachable && service.models.length === 0) {
      skipped.push(`${service.ip}:${service.port} (not verified)`);
      continue;
    }
    const candidate = providerFromService(service);
    if (providers.some((p) => p.endpoint === candidate.endpoint)) {
      skipped.push(`${candidate.name} (endpoint exists)`);
      continue;
    }
    if (providers.some((p) => p.id === candidate.id)) {
      skipped.push(`${candidate.name} (id exists)`);
      continue;
    }
    providers.push(candidate);
    added.push(candidate.name);
  }
  writeAlsState(paths, state);
  return { added, skipped, cleanup };
}
