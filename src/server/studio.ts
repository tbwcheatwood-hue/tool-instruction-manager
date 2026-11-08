import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { connectionKind } from "../shared/connection";
import type { ProviderConfig } from "../shared/types";

export interface StudioSettings {
  url: string;
  token: string;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertLoopbackStudioUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Studio address must be an http URL on 127.0.0.1 or localhost");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Studio address must use http or https");
  }
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error("Studio address must stay on this machine (127.0.0.1 or localhost)");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function readLegacyUrl(dataDir: string): Promise<string> {
  try {
    const saved = (await readFile(path.join(dataDir, "autonomous.url"), "utf8")).trim();
    return assertLoopbackStudioUrl(saved);
  } catch {
    return "http://127.0.0.1:8080/";
  }
}

export async function readStudio(dataDir: string): Promise<StudioSettings> {
  try {
    const parsed = JSON.parse(await readFile(path.join(dataDir, "studio.json"), "utf8")) as { url?: unknown; token?: unknown };
    return {
      url: assertLoopbackStudioUrl(typeof parsed.url === "string" ? parsed.url : "http://127.0.0.1:8080/"),
      token: typeof parsed.token === "string" ? parsed.token : "",
    };
  } catch {
    return { url: await readLegacyUrl(dataDir), token: "" };
  }
}

export async function writeStudio(dataDir: string, settings: StudioSettings): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const safe = { url: assertLoopbackStudioUrl(settings.url), token: settings.token };
  await writeFile(path.join(dataDir, "studio.json"), JSON.stringify(safe, null, 2));
}

export async function probeStudio(url: string): Promise<boolean> {
  try {
    const response = await fetch(assertLoopbackStudioUrl(url), { signal: AbortSignal.timeout(800) });
    return response.status > 0;
  } catch {
    return false;
  }
}

function redact(text: string, secret: string): string {
  const cleaned = secret ? text.split(secret).join("[redacted]") : text;
  return cleaned.slice(0, 500);
}

export async function relayViaStudio(options: {
  settings: StudioSettings;
  provider: ProviderConfig;
  prompt: string;
  temperature: number;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; via: "simulated" | "studio" }> {
  if (options.provider.kind === "simulated" || connectionKind(options.provider) === "simulated") {
    return {
      text: `[simulated] Loop Studio relay was not called. ${options.provider.name} does not use a model endpoint.\n${options.prompt}`,
      via: "simulated",
    };
  }
  const running = await probeStudio(options.settings.url);
  if (!running) {
    throw new Error(`Autonomous Loop Studio is not answering at ${options.settings.url}`);
  }
  const endpoint = `${(options.provider.baseUrl ?? "").replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.settings.token) headers["X-Router-Token"] = options.settings.token;
  const response = await (options.fetchImpl ?? fetch)(new URL("/api/llm", options.settings.url), {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: "custom",
      endpoint,
      api_key: options.provider.apiKey ?? "",
      model: options.provider.model ?? "",
      temperature: options.temperature,
      messages: [{ role: "user", content: options.prompt }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const raw = await response.text();
  let body: { content?: unknown; error?: unknown } = {};
  try {
    body = JSON.parse(raw) as { content?: unknown; error?: unknown };
  } catch {
    throw new Error(`Loop Studio returned a non-JSON response (${response.status})`);
  }
  if (!response.ok || body.error) {
    const message = typeof body.error === "string" ? body.error : raw;
    throw new Error(redact(message, options.provider.apiKey ?? ""));
  }
  if (typeof body.content !== "string" || !body.content.trim()) {
    throw new Error("Loop Studio relay returned no content");
  }
  return { text: body.content, via: "studio" };
}
