import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProviderConfig, RunResult, Workflow } from "../shared/types";
import { parseWorkflow } from "../shared/workflow";

const simulatedProvider: ProviderConfig = {
  id: "simulated",
  name: "Simulated",
  kind: "simulated",
  model: "simulated",
};

function assertId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Invalid id");
  return id;
}

export class FileStore {
  constructor(private readonly root: string) {}

  async init(): Promise<void> {
    await mkdir(path.join(this.root, "workflows"), { recursive: true });
    await mkdir(path.join(this.root, "runs"), { recursive: true });
    try {
      await readFile(this.providersPath, "utf8");
    } catch {
      await writeFile(this.providersPath, JSON.stringify([simulatedProvider], null, 2));
    }
  }

  private get providersPath(): string {
    return path.join(this.root, "providers.json");
  }

  async listWorkflows(): Promise<Workflow[]> {
    const files = await readdir(path.join(this.root, "workflows"));
    const workflows: Workflow[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      workflows.push(await this.getWorkflow(file.replace(/\.json$/, "")));
    }
    return workflows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const raw = await readFile(path.join(this.root, "workflows", `${assertId(id)}.json`), "utf8");
    return parseWorkflow(JSON.parse(raw));
  }

  async saveWorkflow(workflow: Workflow): Promise<void> {
    assertId(workflow.id);
    await writeFile(path.join(this.root, "workflows", `${workflow.id}.json`), JSON.stringify(workflow, null, 2));
  }

  async deleteWorkflow(id: string): Promise<void> {
    await rm(path.join(this.root, "workflows", `${assertId(id)}.json`), { force: true });
  }

  async listProviders(): Promise<ProviderConfig[]> {
    const parsed = JSON.parse(await readFile(this.providersPath, "utf8")) as ProviderConfig[];
    if (!parsed.some((provider) => provider.id === "simulated")) parsed.unshift(simulatedProvider);
    return parsed;
  }

  async saveProviders(providers: ProviderConfig[]): Promise<void> {
    const next = providers.some((provider) => provider.id === "simulated") ? providers : [simulatedProvider, ...providers];
    await writeFile(this.providersPath, JSON.stringify(next, null, 2));
  }

  async saveRun(run: RunResult): Promise<void> {
    assertId(run.id);
    await writeFile(path.join(this.root, "runs", `${run.id}.json`), JSON.stringify(run, null, 2));
  }

  async listRuns(): Promise<Pick<RunResult, "id" | "workflowId" | "workflowName" | "status" | "startedAt" | "finishedAt">[]> {
    const dir = path.join(this.root, "runs");
    const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
    const runs: RunResult[] = [];
    for (const file of files) {
      runs.push(JSON.parse(await readFile(path.join(dir, file), "utf8")) as RunResult);
    }
    return runs
      .map((run) => ({
        id: run.id,
        workflowId: run.workflowId,
        workflowName: run.workflowName,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      }))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async getRun(id: string): Promise<RunResult> {
    const raw = await readFile(path.join(this.root, "runs", `${assertId(id)}.json`), "utf8");
    return JSON.parse(raw) as RunResult;
  }
}
