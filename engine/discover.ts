import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import {
  AI_PROBE_PORTS,
  type DiscoveredService,
  type DiscoveryReport,
  type HostProfile,
  type InferenceServerKind,
} from "../shared/connections";

const exec = promisify(execFile);

function shell(cmd: string, args: string[], timeout = 4000): Promise<string> {
  return exec(cmd, args, { timeout }).then((r) => `${r.stdout}${r.stderr ?? ""}`.trim());
}

export async function hostProfile(): Promise<HostProfile> {
  const addresses: HostProfile["addresses"] = [];
  for (const [iface, nets] of Object.entries(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        addresses.push({ iface, ip: net.address, state: "up" });
      }
    }
  }
  let gateway: string | undefined;
  let subnet: string | undefined;
  try {
    const route = await shell("ip", ["route"]);
    const via = route.split("\n").find((line) => line.startsWith("default"));
    gateway = via?.match(/default via (\S+)/)?.[1];
    const lan = route.split("\n").find((line) => line.includes("proto kernel scope link") && line.includes("src"));
    const cidr = lan?.match(/(\d+\.\d+\.\d+\.\d+\/\d+)/)?.[1];
    subnet = cidr;
  } catch {
    // ignore
  }
  return { hostname: os.hostname(), os: `${os.type()} ${os.release()}`, addresses, gateway, subnet };
}

async function arpNeighbors(): Promise<string[]> {
  try {
    const arp = await shell("ip", ["neigh", "show"]);
    const ips = new Set<string>();
    for (const line of arp.split("\n")) {
      const ip = line.match(/^(\d+\.\d+\.\d+\.\d+)/)?.[1];
      if (ip && !ip.endsWith(".255")) ips.add(ip);
    }
    return [...ips].slice(0, 64);
  } catch {
    try {
      const text = fs.readFileSync("/proc/net/arp", "utf8");
      const ips = new Set<string>();
      for (const line of text.split("\n").slice(1)) {
        const ip = line.split(/\s+/)[0];
        if (ip && ip.includes(".")) ips.add(ip);
      }
      return [...ips].slice(0, 64);
    } catch {
      return [];
    }
  }
}

async function pingOnce(ip: string): Promise<boolean> {
  try {
    await exec("ping", ["-c", "1", "-W", "1", ip], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

function parseModels(body: unknown, kind: InferenceServerKind): string[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  if (kind === "ollama" && Array.isArray(record.models)) {
    return record.models
      .map((m) => (m && typeof m === "object" ? (m as { name?: string }).name : null))
      .filter((name): name is string => typeof name === "string");
  }
  if (Array.isArray(record.data)) {
    return record.data.map((m) => (m && typeof m === "object" ? String((m as { id?: string }).id ?? "") : "")).filter(Boolean);
  }
  if (Array.isArray(record.models)) {
    return record.models
      .map((m) => (m && typeof m === "object" ? String((m as { key?: string; id?: string }).key ?? (m as { id?: string }).id ?? "") : ""))
      .filter(Boolean);
  }
  return [];
}

async function probePort(ip: string, port: number, path: string, kind: InferenceServerKind): Promise<DiscoveredService | null> {
  const base = `http://${ip}:${port}`;
  const url = `${base}${path}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const models = parseModels(body, kind);
    let loaded: string | null = null;
    let supportsLoad = kind === "lmstudio" || kind === "ollama";
    if (kind === "lmstudio" && body && typeof body === "object") {
      const modelsArr = (body as { models?: { loaded_instances?: unknown[]; key?: string }[] }).models ?? [];
      const loadedEntry = modelsArr.find((m) => Array.isArray(m.loaded_instances) && m.loaded_instances.length > 0);
      loaded = loadedEntry?.key ?? null;
    }
    const reachable = await probeInference(base);
    return {
      ip,
      port,
      serverKind: kind,
      baseUrl: `${base}/v1`,
      models,
      running: true,
      reachable,
      loadedModel: loaded,
      supportsLoad,
      detail: `HTTP ${response.status} at ${path}`,
      probeAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function probeInference(baseV1: string): Promise<boolean> {
  try {
    const models = await fetch(`${baseV1}/models`, { signal: AbortSignal.timeout(2000) });
    return models.ok;
  } catch {
    return false;
  }
}

export async function discoverNetwork(): Promise<DiscoveryReport> {
  const host = await hostProfile();
  const locals = new Set(["127.0.0.1", ...host.addresses.map((a) => a.ip)]);
  const neighbors = await arpNeighbors();
  const targets = [...locals, ...neighbors];
  const services: DiscoveredService[] = [];
  const incomplete: string[] = [];

  for (const ip of targets) {
    if (!locals.has(ip)) {
      const up = await pingOnce(ip);
      if (!up) continue;
    }
    for (const probe of AI_PROBE_PORTS) {
      const found = await probePort(ip, probe.port, probe.path, probe.kind);
      if (found) services.push(found);
    }
  }

  if (neighbors.length === 0) incomplete.push("No ARP neighbors found. Devices asleep or on another VLAN may be missing.");
  if (services.length === 0) incomplete.push("No inference APIs answered on common ports. Services bound to 127.0.0.1 only need SSH port forwarding.");

  return {
    host,
    neighbors,
    services,
    incomplete: incomplete.length ? incomplete.join(" ") : undefined,
  };
}
