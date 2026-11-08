export type ConnectionKind = "simulated" | "local" | "external";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function connectionKind(provider: { kind: string; baseUrl?: string }): ConnectionKind {
  if (provider.kind === "simulated") return "simulated";
  try {
    const host = new URL(provider.baseUrl ?? "").hostname;
    if (LOOPBACK.has(host)) return "local";
  } catch {
    /* A missing or unreadable URL is still an external configuration. */
  }
  return "external";
}

export function connectionLabel(provider: { kind: string; name: string; baseUrl?: string }): string {
  const kind = connectionKind(provider);
  if (kind === "simulated") return `${provider.name} — simulated, no model call`;
  let host = provider.baseUrl || "no base URL";
  try {
    host = new URL(provider.baseUrl ?? "").host;
  } catch {
    /* Keep the raw value when it is not a URL. */
  }
  if (kind === "local") return `${provider.name} — local model at ${host}`;
  return `${provider.name} — external service at ${host}`;
}
