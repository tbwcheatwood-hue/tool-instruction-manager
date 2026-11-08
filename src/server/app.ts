import cors from "cors";
import express, { type Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { executeWorkflow } from "../engine/execute";
import { examples } from "../engine/examples";
import { callOpenAICompatible, resolveProvider, type ChatMessage } from "../engine/providers";
import { connectionKind } from "../shared/connection";
import { assertLoopbackStudioUrl, probeStudio, readStudio, relayViaStudio, writeStudio } from "./studio";
import type { ProviderConfig, ProviderPublic, RunEvent, RunResult, Workflow } from "../shared/types";
import { WorkflowError, parseWorkflow } from "../shared/workflow";
import { FileStore } from "./store";

interface ActiveRun extends RunResult {
  listeners: Set<(event: RunEvent) => void>;
  doneListeners: Set<() => void>;
}

function publicProvider(provider: ProviderConfig): ProviderPublic {
  const { apiKey, ...rest } = provider;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

function newId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

export function createApp(dataDir: string): Express {
  const store = new FileStore(dataDir);
  const ready = store.init();
  const active = new Map<string, ActiveRun>();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  const gate = async (res: express.Response, action: () => Promise<void>) => {
    try {
      await ready;
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      const status = code === "ENOENT" ? 404 : error instanceof WorkflowError || message === "Invalid id" ? 400 : 500;
      if (!res.headersSent) res.status(status).json({ error: message });
    }
  };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "agent-routing-lab" });
  });

  const studioStatus = async () => {
    const settings = await readStudio(dataDir);
    return {
      name: "Autonomous Loop Studio",
      url: settings.url,
      running: await probeStudio(settings.url),
      hasToken: Boolean(settings.token),
    };
  };

  app.get("/api/studio", (_req, res) => {
    void gate(res, async () => {
      res.json(await studioStatus());
    });
  });

  app.put("/api/studio", (req, res) => {
    void gate(res, async () => {
      const current = await readStudio(dataDir);
      let url: string;
      try {
        url = assertLoopbackStudioUrl(typeof req.body?.url === "string" ? req.body.url : current.url);
      } catch (error) {
        throw new WorkflowError(error instanceof Error ? error.message : String(error));
      }
      let token = current.token;
      if (req.body?.token === null) token = "";
      else if (typeof req.body?.token === "string" && req.body.token.trim()) token = req.body.token.trim();
      await writeStudio(dataDir, { url, token });
      res.json(await studioStatus());
    });
  });

  app.post("/api/chat", (req, res) => {
    void gate(res, async () => {
      const provider = resolveProvider(await store.listProviders(), String(req.body?.providerId ?? ""));
      const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [];
      if (incoming.length < 1 || incoming.length > 40) throw new WorkflowError("Send between 1 and 40 messages");
      const messages: ChatMessage[] = incoming.map((message: unknown) => {
        if (!message || typeof message !== "object") throw new WorkflowError("Each message needs a role and content");
        const record = message as { role?: unknown; content?: unknown };
        if (record.role !== "system" && record.role !== "user" && record.role !== "assistant") throw new WorkflowError("Message role is not supported");
        if (typeof record.content !== "string" || !record.content.trim() || record.content.length > 20_000) {
          throw new WorkflowError("Each message needs text under 20000 characters");
        }
        return { role: record.role, content: record.content };
      });
      const kind = connectionKind(provider);
      if (provider.kind === "simulated") {
        const latest = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
        res.json({
          text: `[simulated] No model endpoint was called.\n${latest}`,
          simulated: true,
          providerId: provider.id,
          model: "simulated",
          connection: kind,
        });
        return;
      }
      const result = await callOpenAICompatible({
        provider,
        model: provider.model ?? "",
        temperature: 0.2,
        messages,
        fetchImpl: fetch,
      });
      res.json({ text: result.text, simulated: false, providerId: provider.id, model: provider.model ?? "", connection: kind });
    });
  });

  app.get("/api/examples", (_req, res) => {
    res.json(examples());
  });

  app.get("/api/workflows", (_req, res) => {
    void gate(res, async () => {
      res.json(await store.listWorkflows());
    });
  });

  app.post("/api/workflows", (req, res) => {
    void gate(res, async () => {
      const workflow = parseWorkflow(req.body);
      workflow.id = workflow.id || newId();
      workflow.updatedAt = new Date().toISOString();
      await store.saveWorkflow(workflow);
      res.status(201).json(workflow);
    });
  });

  app.post("/api/workflows/import", (req, res) => {
    void gate(res, async () => {
      const workflow = parseWorkflow(req.body.workflow ?? req.body);
      workflow.id = newId();
      workflow.updatedAt = new Date().toISOString();
      await store.saveWorkflow(workflow);
      res.status(201).json(workflow);
    });
  });

  app.get("/api/workflows/:id/export", (req, res) => {
    void gate(res, async () => {
      const workflow = await store.getWorkflow(req.params.id);
      res.setHeader("Content-Disposition", `attachment; filename="${workflow.id}.json"`);
      res.json(workflow);
    });
  });

  app.get("/api/workflows/:id", (req, res) => {
    void gate(res, async () => {
      res.json(await store.getWorkflow(req.params.id));
    });
  });

  app.put("/api/workflows/:id", (req, res) => {
    void gate(res, async () => {
      const workflow = parseWorkflow({ ...req.body, id: req.params.id });
      workflow.id = req.params.id;
      workflow.updatedAt = new Date().toISOString();
      await store.saveWorkflow(workflow);
      res.json(workflow);
    });
  });

  app.delete("/api/workflows/:id", (req, res) => {
    void gate(res, async () => {
      await store.deleteWorkflow(req.params.id);
      res.status(204).end();
    });
  });

  app.get("/api/providers", (_req, res) => {
    void gate(res, async () => {
      const providers = await store.listProviders();
      res.json(providers.map(publicProvider));
    });
  });

  app.post("/api/providers", (req, res) => {
    void gate(res, async () => {
      const providers = await store.listProviders();
      const name = String(req.body.name ?? "OpenAI-compatible").trim() || "OpenAI-compatible";
      const created: ProviderConfig = {
        id: newId(),
        name,
        kind: "openai-compatible",
        baseUrl: String(req.body.baseUrl ?? "").trim(),
        model: String(req.body.model ?? "").trim(),
        apiKey: String(req.body.apiKey ?? ""),
      };
      providers.push(created);
      await store.saveProviders(providers);
      res.status(201).json(publicProvider(created));
    });
  });

  app.put("/api/providers/:id", (req, res) => {
    void gate(res, async () => {
      const providers = await store.listProviders();
      const current = providers.find((provider) => provider.id === req.params.id);
      if (!current) {
        res.status(404).json({ error: "Provider not found" });
        return;
      }
      if (current.kind === "simulated") {
        current.name = String(req.body.name ?? current.name);
      } else {
        current.name = String(req.body.name ?? current.name);
        current.baseUrl = String(req.body.baseUrl ?? current.baseUrl ?? "");
        current.model = String(req.body.model ?? current.model ?? "");
        if (typeof req.body.apiKey === "string" && req.body.apiKey.length > 0) current.apiKey = req.body.apiKey;
        if (req.body.apiKey === null) current.apiKey = "";
      }
      await store.saveProviders(providers);
      res.json(publicProvider(current));
    });
  });

  app.delete("/api/providers/:id", (req, res) => {
    void gate(res, async () => {
      if (req.params.id === "simulated") {
        res.status(400).json({ error: "The simulated provider cannot be deleted" });
        return;
      }
      const providers = (await store.listProviders()).filter((provider) => provider.id !== req.params.id);
      await store.saveProviders(providers);
      res.status(204).end();
    });
  });

  app.post("/api/providers/:id/test", (req, res) => {
    void gate(res, async () => {
      const provider = (await store.listProviders()).find((item) => item.id === req.params.id);
      if (!provider) {
        res.status(404).json({ error: "Provider not found" });
        return;
      }
      if (provider.kind === "simulated") {
        res.json({ ok: true, simulated: true, message: "Simulated provider does not call a model endpoint." });
        return;
      }
      try {
        const result = await callOpenAICompatible({
          provider,
          model: provider.model ?? "",
          temperature: 0,
          messages: [
            { role: "system", content: "Reply with the single word pong." },
            { role: "user", content: "ping" },
          ],
          fetchImpl: fetch,
        });
        res.json({ ok: true, simulated: false, text: result.text });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ ok: false, simulated: false, error: message });
      }
    });
  });

  app.get("/api/runs", (_req, res) => {
    void gate(res, async () => {
      res.json(await store.listRuns());
    });
  });

  app.get("/api/runs/:id/stream", (req, res) => {
    const run = active.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Run is not active" });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    let last = 0;
    let closed = false;
    const send = (event: RunEvent) => {
      if (closed || event.seq <= last) return;
      last = event.seq;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const finish = () => {
      if (closed) return;
      closed = true;
      res.write(`event: done\ndata: ${JSON.stringify({ status: run.status, id: run.id })}\n\n`);
      res.end();
    };
    run.listeners.add(send);
    for (const event of run.events) send(event);
    if (run.status !== "running") finish();
    else run.doneListeners.add(finish);
    req.on("close", () => {
      closed = true;
      run.listeners.delete(send);
      run.doneListeners.delete(finish);
    });
  });

  app.get("/api/runs/:id", (req, res) => {
    void gate(res, async () => {
      const memory = active.get(req.params.id);
      if (memory) {
        const { listeners, doneListeners, ...run } = memory;
        void listeners;
        void doneListeners;
        res.json(run);
        return;
      }
      res.json(await store.getRun(req.params.id));
    });
  });

  app.post("/api/runs", (req, res) => {
    void gate(res, async () => {
      const workflow = parseWorkflow(req.body.workflow) as Workflow;
      if (!workflow.id) workflow.id = "unsaved";
      const input = req.body.input;
      const wait = Boolean(req.body.wait);
      const providers = await store.listProviders();
      const run: ActiveRun = {
        id: newId(),
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: "running",
        startedAt: new Date().toISOString(),
        input,
        events: [],
        artifacts: [],
        nodeResults: {},
        output: null,
        listeners: new Set(),
        doneListeners: new Set(),
      };
      active.set(run.id, run);

      const execution = (async () => {
        try {
          const result = await executeWorkflow(workflow, {
            input,
            providers,
            events: run.events,
            onEvent: (event) => {
              for (const listener of run.listeners) listener(event);
            },
            studioRelay: async (request) => {
              const provider = resolveProvider(providers, request.providerId);
              const settings = await readStudio(dataDir);
              return relayViaStudio({ settings, provider, prompt: request.prompt, temperature: request.temperature });
            },
          });
          run.status = result.status;
          run.artifacts = result.artifacts;
          run.nodeResults = result.nodeResults;
          run.output = result.output;
        } catch (error) {
          run.status = "error";
          run.error = error instanceof Error ? error.message : String(error);
        } finally {
          run.finishedAt = new Date().toISOString();
          const { listeners, doneListeners, ...stored } = run;
          await store.saveRun(stored);
          for (const listener of doneListeners) listener();
          listeners.clear();
          doneListeners.clear();
          setTimeout(() => active.delete(run.id), 60_000);
        }
      })();

      if (wait) {
        await execution;
        const { listeners, doneListeners, ...stored } = run;
        void listeners;
        void doneListeners;
        res.status(run.error && !run.finishedAt ? 400 : 200).json(stored);
        return;
      }
      res.status(202).json({ runId: run.id });
    });
  });

  const dist = path.join(process.cwd(), "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  return app;
}
