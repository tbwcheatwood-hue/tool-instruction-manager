import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { reviewPassWorkflow } from "../src/engine/examples";
import { createApp } from "../src/server/app";
import type { RunResult, Workflow } from "../src/shared/types";

let server: Server | null = null;
let dir = "";

async function start() {
  dir = await mkdtemp(path.join(tmpdir(), "arl-"));
  const app = createApp(dir);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server?.once("listening", () => resolve()));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
    server = null;
  }
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("HTTP API", () => {
  it("saves, exports, runs, and replays a workflow without leaking provider secrets", async () => {
    const base = await start();
    const created = await fetch(`${base}/api/providers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Local", baseUrl: "http://127.0.0.1:9/v1", model: "demo", apiKey: "sk-store-secret" }),
    });
    expect(created.status).toBe(201);
    const provider = (await created.json()) as { hasApiKey: boolean; apiKey?: string };
    expect(provider.hasApiKey).toBe(true);
    expect(provider.apiKey).toBeUndefined();

    const workflow = reviewPassWorkflow();
    const saved = await fetch(`${base}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflow),
    });
    expect(saved.status).toBe(201);
    const exported = await fetch(`${base}/api/workflows/example-pass/export`);
    const body = (await exported.json()) as Workflow;
    expect(body.nodes).toHaveLength(5);
    expect(JSON.stringify(body)).not.toContain("sk-store-secret");

    const runResponse = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: body, input: "Persisted report", wait: true }),
    });
    const run = (await runResponse.json()) as RunResult;
    expect(run.status).toBe("ok");
    expect(run.artifacts[0]?.content).toContain("Persisted report");
    expect(JSON.stringify(run)).not.toContain("sk-store-secret");

    const history = (await (await fetch(`${base}/api/runs`)).json()) as { id: string }[];
    expect(history.map((item) => item.id)).toContain(run.id);
    const loaded = (await (await fetch(`${base}/api/runs/${run.id}`)).json()) as RunResult;
    expect(loaded.output).toEqual(run.output);
  });

  it("streams events for a background run", async () => {
    const base = await start();
    const examples = (await (await fetch(`${base}/api/examples`)).json()) as Workflow[];
    const started = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: examples[1], input: "no artifact" }),
    });
    expect(started.status).toBe(202);
    const { runId } = (await started.json()) as { runId: string };
    const stream = await fetch(`${base}/api/runs/${runId}/stream`);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const text = await stream.text();
    expect(text).toContain("event: done");
    expect(text).toContain("review");
    const finished = (await (await fetch(`${base}/api/runs/${runId}`)).json()) as RunResult;
    expect(finished.status).toBe("rejected");
  });

  it("keeps the studio on this machine and does not return its token", async () => {
    const base = await start();
    const rejected = await fetch(`${base}/api/studio`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", token: "studio-secret" }),
    });
    expect(rejected.status).toBe(400);

    const saved = await fetch(`${base}/api/studio`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://127.0.0.1:8080/path", token: "studio-secret" }),
    });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { url: string; hasToken: boolean; token?: string };
    expect(body.url).toBe("http://127.0.0.1:8080/");
    expect(body.hasToken).toBe(true);
    expect(JSON.stringify(body)).not.toContain("studio-secret");
  });

  it("answers chat from the simulated provider", async () => {
    const base = await start();
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "simulated", messages: [{ role: "user", content: "hello lab" }] }),
    });
    const body = (await response.json()) as { simulated: boolean; connection: string; text: string };
    expect(response.status).toBe(200);
    expect(body.simulated).toBe(true);
    expect(body.connection).toBe("simulated");
    expect(body.text).toContain("[simulated]");
    expect(body.text).toContain("hello lab");
  });

  it("reports the simulated provider test without calling a model", async () => {
    const base = await start();
    const response = await fetch(`${base}/api/providers/simulated/test`, { method: "POST" });
    const body = (await response.json()) as { ok: boolean; simulated: boolean };
    expect(body).toMatchObject({ ok: true, simulated: true });
  });
});
