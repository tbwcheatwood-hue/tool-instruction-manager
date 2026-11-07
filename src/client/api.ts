import type { ProviderPublic, RunEvent, RunResult, Workflow } from "../shared/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore non-json errors */
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type RunSummary = Pick<RunResult, "id" | "workflowId" | "workflowName" | "status" | "startedAt" | "finishedAt">;

export const api = {
  examples: () => request<Workflow[]>("/api/examples"),
  workflows: () => request<Workflow[]>("/api/workflows"),
  saveWorkflow: (workflow: Workflow) =>
    workflow.id
      ? request<Workflow>(`/api/workflows/${workflow.id}`, { method: "PUT", body: JSON.stringify(workflow) })
      : request<Workflow>("/api/workflows", { method: "POST", body: JSON.stringify(workflow) }),
  importWorkflow: (workflow: unknown) => request<Workflow>("/api/workflows/import", { method: "POST", body: JSON.stringify({ workflow }) }),
  providers: () => request<ProviderPublic[]>("/api/providers"),
  createProvider: (body: { name: string; baseUrl: string; model: string; apiKey: string }) =>
    request<ProviderPublic>("/api/providers", { method: "POST", body: JSON.stringify(body) }),
  updateProvider: (id: string, body: { name: string; baseUrl: string; model: string; apiKey?: string | null }) =>
    request<ProviderPublic>(`/api/providers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  testProvider: (id: string) => request<{ ok: boolean; simulated: boolean; message?: string; text?: string; error?: string }>(`/api/providers/${id}/test`, { method: "POST", body: "{}" }),
  startRun: (workflow: Workflow, input: unknown) => request<{ runId: string }>("/api/runs", { method: "POST", body: JSON.stringify({ workflow, input }) }),
  run: (id: string) => request<RunResult>(`/api/runs/${id}`),
  runs: () => request<RunSummary[]>("/api/runs"),
};

export function watchRun(runId: string, onEvent: (event: RunEvent) => void, onDone: (status: string) => void): () => void {
  const source = new EventSource(`/api/runs/${runId}/stream`);
  source.onmessage = (message) => {
    onEvent(JSON.parse(message.data) as RunEvent);
  };
  source.addEventListener("done", (message) => {
    const payload = JSON.parse((message as MessageEvent).data) as { status: string };
    onDone(payload.status);
    source.close();
  });
  source.onerror = () => {
    onDone("error");
    source.close();
  };
  return () => source.close();
}
