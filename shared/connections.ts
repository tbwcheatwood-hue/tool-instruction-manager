export type ConnectionKind = "local" | "lan" | "ssh_tunnel" | "phone" | "custom";

export type InferenceServerKind =
  | "lmstudio"
  | "ollama"
  | "llamacpp"
  | "openai_compat"
  | "vllm"
  | "localai"
  | "lemonade"
  | "kobold"
  | "unknown";

export type ConnectionProfile = {
  id: string;
  name: string;
  kind: ConnectionKind;
  host: string;
  sshUser?: string;
  sshPort?: number;
  localPort?: number;
  remoteHost?: string;
  remotePort?: number;
  baseUrl?: string;
  serverKind?: InferenceServerKind;
  modelIds?: string[];
  notes?: string;
  tunnelPid?: number | null;
  enabled: boolean;
  updatedAt: string;
};

export type HostProfile = {
  hostname: string;
  os: string;
  addresses: { iface: string; ip: string; state?: string }[];
  gateway?: string;
  subnet?: string;
};

export type DiscoveredService = {
  ip: string;
  hostname?: string;
  port: number;
  serverKind: InferenceServerKind;
  baseUrl: string;
  models: string[];
  running: boolean;
  reachable: boolean;
  loadedModel?: string | null;
  supportsLoad?: boolean;
  detail: string;
  probeAt: string;
};

export type DiscoveryReport = {
  host: HostProfile;
  neighbors: string[];
  services: DiscoveredService[];
  incomplete?: string;
};

export type AlsRegisterResult = {
  added: string[];
  skipped: string[];
  cleanup?: AlsCleanupResult;
  error?: string;
};

export type AlsCleanupResult = {
  removed: string[];
  kept: number;
  error?: string;
};

export const CONNECTION_KIND_LABEL: Record<ConnectionKind, string> = {
  local: "This machine",
  lan: "LAN host",
  ssh_tunnel: "SSH tunnel",
  phone: "Phone / mobile",
  custom: "Custom",
};

export const AI_PROBE_PORTS: { port: number; kind: InferenceServerKind; path: string }[] = [
  { port: 1234, kind: "lmstudio", path: "/v1/models" },
  { port: 11434, kind: "ollama", path: "/api/tags" },
  { port: 8080, kind: "openai_compat", path: "/v1/models" },
  { port: 8000, kind: "vllm", path: "/v1/models" },
  { port: 5001, kind: "localai", path: "/v1/models" },
  { port: 5002, kind: "kobold", path: "/v1/models" },
  { port: 8001, kind: "lemonade", path: "/v1/models" },
];
