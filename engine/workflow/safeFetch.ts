const GITHUB_API = "api.github.com";
const GITHUB_RAW = "raw.githubusercontent.com";

const ALLOWED_REPOS = new Set([
  "langflow-ai/langflow",
  "FlowiseAI/FlowiseDocs",
  "FlowiseAI/Flowise",
  "n8n-io/n8n-workflows",
  "Zie619/n8n-workflows",
]);

export function assertPublicGithubRaw(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (parsed.protocol !== "https:") throw new Error("Only https URLs are allowed.");
  if (parsed.hostname !== GITHUB_RAW) throw new Error("Remote import is limited to raw.githubusercontent.com.");
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 4) throw new Error("Malformed GitHub raw URL.");
  const repo = `${parts[0]}/${parts[1]}`;
  if (!ALLOWED_REPOS.has(repo)) {
    throw new Error(`Repository not allowlisted for remote import: ${repo}`);
  }
  return parsed;
}

export function assertGithubApiPath(path: string): void {
  if (!path.startsWith("/search/code")) throw new Error("Unexpected GitHub API path.");
}

export function isAllowlistedRepo(fullName: string): boolean {
  return ALLOWED_REPOS.has(fullName);
}

export async function fetchGithubApi(path: string, token?: string): Promise<unknown> {
  assertGithubApiPath(path);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "T.I.M.-workflow-search",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://${GITHUB_API}${path}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 403) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    throw new Error(
      remaining === "0"
        ? "GitHub API rate limit reached. Set GITHUB_TOKEN for higher limits or try again later."
        : "GitHub API refused the request (403).",
    );
  }
  if (!response.ok) throw new Error(`GitHub API error (HTTP ${response.status}).`);
  return response.json() as Promise<unknown>;
}

export async function fetchAllowlistedRaw(url: string, maxBytes = 2_000_000): Promise<string> {
  const parsed = assertPublicGithubRaw(url);
  const response = await fetch(parsed.toString(), { signal: AbortSignal.timeout(20000), redirect: "follow" });
  if (!response.ok) throw new Error(`Could not download workflow (HTTP ${response.status}).`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error("Workflow file is too large.");
  const text = await response.text();
  if (text.length > maxBytes) throw new Error("Workflow file is too large.");
  return text;
}
