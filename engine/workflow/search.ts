import type { WorkflowSearchHit, WorkflowSearchPlatform, WorkflowSearchResponse } from "../../shared/workflowImport";
import { fetchGithubApi, isAllowlistedRepo } from "./safeFetch";

const PLATFORM_QUERY: Record<
  WorkflowSearchPlatform,
  { q: (term: string) => string; providerNote: string }
> = {
  langflow: {
    q: (term) => `repo:langflow-ai/langflow path:starter_projects extension:json ${term}`.trim(),
    providerNote: "Langflow has no public workflow catalog API. Results come from GitHub (official starter_projects JSON).",
  },
  flowise: {
    q: (term) => `repo:FlowiseAI/FlowiseDocs extension:json ${term}`.trim(),
    providerNote: "Flowise has no unified public search API. Results come from FlowiseAI docs/templates on GitHub.",
  },
  n8n: {
    q: (term) => `repo:n8n-io/n8n-workflows extension:json ${term}`.trim(),
    providerNote: "n8n workflow sharing uses community repos — searching n8n-io/n8n-workflows on GitHub.",
  },
};

type GithubSearchItem = {
  name: string;
  path: string;
  html_url: string;
  repository: { full_name: string; default_branch?: string };
  score?: number;
};

type GithubSearchResponse = {
  total_count: number;
  items?: GithubSearchItem[];
  message?: string;
};

function hitName(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.json$/i, "").replace(/[-_]/g, " ");
}

function toRawUrl(repo: string, path: string, branch: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
}

export async function searchPublicWorkflows(
  platform: WorkflowSearchPlatform,
  query: string,
  limit = 12,
): Promise<WorkflowSearchResponse> {
  const cfg = PLATFORM_QUERY[platform];
  const q = cfg.q(query.slice(0, 120));
  const token = process.env.GITHUB_TOKEN?.trim();
  let payload: GithubSearchResponse;
  try {
    payload = (await fetchGithubApi(
      `/search/code?q=${encodeURIComponent(q)}&per_page=${Math.min(limit, 30)}`,
      token || undefined,
    )) as GithubSearchResponse;
  } catch (cause) {
    return {
      platform,
      query,
      results: [],
      incomplete: cause instanceof Error ? cause.message : String(cause),
      providerNote: cfg.providerNote,
    };
  }

  if (payload.message) {
    return { platform, query, results: [], incomplete: payload.message, providerNote: cfg.providerNote };
  }

  const results: WorkflowSearchHit[] = [];
  for (const item of payload.items ?? []) {
    const repo = item.repository?.full_name;
    if (!repo || !isAllowlistedRepo(repo)) continue;
    const branch = item.repository.default_branch || "main";
    results.push({
      platform,
      name: hitName(item.path),
      description: `${repo} · ${item.path}`,
      repository: repo,
      path: item.path,
      htmlUrl: item.html_url,
      rawUrl: toRawUrl(repo, item.path, branch),
      score: item.score,
    });
    if (results.length >= limit) break;
  }

  return {
    platform,
    query,
    results,
    providerNote: cfg.providerNote,
    incomplete: results.length === 0 ? "No matches in allowlisted public repositories." : undefined,
  };
}
