import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import fs from "node:fs";
import type { EngineEvent, Graph, WaitRequest } from "../shared/mesh";
import { cleanupAlsProviders, registerServicesInAls, resolveAlsPaths } from "./alsProviders";
import {
  defaultWorkspace,
  deleteConnection,
  deleteFlow,
  ensureExample,
  getFlow,
  getSetting,
  listConnections,
  listFlows,
  recall,
  recordRun,
  remember,
  saveConnection,
  saveFlow,
  setSetting,
} from "./db";
import { discoverNetwork } from "./discover";
import { startTunnel, stopTunnel, tunnelStatus, type TunnelSpec } from "./sshTunnel";
import type { ConnectionProfile } from "../shared/connections";
import { runMesh } from "./execute";
import { readHardware } from "./hardware";
import { listStudioModels, loadModel, streamChat, unloadModel, type StudioSettings } from "./lmstudio";
import { runTool } from "./tools";

const port = Number(process.env.TIM_PORT ?? 8791);
const clients = new Set<WebSocket>();
let active: { id: string; controller: AbortController } | null = null;
const waiters = new Map<string, (value: WaitRequest) => void>();

function studioSettings(): StudioSettings {
  return {
    endpoint: getSetting("lmStudioUrl", process.env.LM_STUDIO_URL || "http://127.0.0.1:1234").replace(/\/$/, ""),
    modelsDir: getSetting("modelsDir", ""),
    workspaceDir: getSetting("workspaceDir", defaultWorkspace),
    mcpBridgeUrl: getSetting("mcpBridgeUrl", ""),
    token: process.env.LM_API_TOKEN || "",
  };
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function publish(runId: string, event: EngineEvent): void {
  const payload = JSON.stringify({ type: "event", runId, event });
  for (const socket of clients) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2_000_000) reject(new Error("Body too large"));
      else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function reply(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

async function handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    reply(res, 204, {});
    return;
  }
  const url = new URL(req.url || "/", "http://127.0.0.1");
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      reply(res, 200, { ok: true, name: "T.I.M." });
      return;
    }
    if (req.method === "GET" && url.pathname === "/hardware") {
      reply(res, 200, await readHardware());
      return;
    }
    if (req.method === "GET" && url.pathname === "/settings") {
      const settings = studioSettings();
      reply(res, 200, {
        lmStudioUrl: settings.endpoint,
        modelsDir: settings.modelsDir,
        workspaceDir: settings.workspaceDir,
        mcpBridgeUrl: settings.mcpBridgeUrl,
        alsRoot: getSetting("alsRoot", process.env.ALS_ROOT || "/home/livingroom/Downloads/Autonomous-master"),
        alsApiUrl: getSetting("alsApiUrl", "http://127.0.0.1:8080"),
      });
      return;
    }
    if (req.method === "PUT" && url.pathname === "/settings") {
      const body = JSON.parse((await readBody(req)) || "{}") as {
        lmStudioUrl?: string;
        modelsDir?: string;
        workspaceDir?: string;
        mcpBridgeUrl?: string;
        alsRoot?: string;
        alsApiUrl?: string;
      };
      if (typeof body.lmStudioUrl === "string") setSetting("lmStudioUrl", body.lmStudioUrl.trim());
      if (typeof body.modelsDir === "string") setSetting("modelsDir", body.modelsDir.trim());
      if (typeof body.workspaceDir === "string" && body.workspaceDir.trim()) setSetting("workspaceDir", body.workspaceDir.trim());
      if (typeof body.mcpBridgeUrl === "string") setSetting("mcpBridgeUrl", body.mcpBridgeUrl.trim());
      if (typeof body.alsRoot === "string") setSetting("alsRoot", body.alsRoot.trim());
      if (typeof body.alsApiUrl === "string") setSetting("alsApiUrl", body.alsApiUrl.trim());
      const settings = studioSettings();
      reply(res, 200, {
        lmStudioUrl: settings.endpoint,
        modelsDir: settings.modelsDir,
        workspaceDir: settings.workspaceDir,
        mcpBridgeUrl: settings.mcpBridgeUrl,
        alsRoot: getSetting("alsRoot", "/home/livingroom/Downloads/Autonomous-master"),
        alsApiUrl: getSetting("alsApiUrl", "http://127.0.0.1:8080"),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/connections/discover") {
      reply(res, 200, await discoverNetwork());
      return;
    }
    if (req.method === "GET" && url.pathname === "/connections") {
      reply(res, 200, listConnections());
      return;
    }
    if (req.method === "POST" && url.pathname === "/connections") {
      const body = JSON.parse((await readBody(req)) || "{}") as ConnectionProfile;
      if (!body.name || !body.kind) throw new Error("Connection name and kind are required.");
      const saved = saveConnection({
        ...body,
        id: body.id || crypto.randomUUID(),
        enabled: body.enabled ?? true,
        host: body.host || "",
        updatedAt: new Date().toISOString(),
      });
      reply(res, 200, saved);
      return;
    }
    const connDelete = url.pathname.match(/^\/connections\/([^/]+)$/);
    if (req.method === "DELETE" && connDelete) {
      deleteConnection(decodeURIComponent(connDelete[1]));
      reply(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/connections/tunnel/start") {
      const body = JSON.parse((await readBody(req)) || "{}") as TunnelSpec;
      reply(res, 200, startTunnel(body));
      return;
    }
    if (req.method === "POST" && url.pathname === "/connections/tunnel/stop") {
      const body = JSON.parse((await readBody(req)) || "{}") as { id: string };
      reply(res, 200, stopTunnel(body.id));
      return;
    }
    if (req.method === "GET" && url.pathname === "/connections/tunnel/status") {
      const id = url.searchParams.get("id");
      if (!id) throw new Error("Missing id");
      const profile = listConnections().find((item) => item.id === id);
      if (!profile || profile.kind !== "ssh_tunnel") throw new Error("SSH profile not found");
      const spec: TunnelSpec = {
        id: profile.id,
        name: profile.name,
        sshHost: profile.host,
        sshUser: profile.sshUser || "user",
        sshPort: profile.sshPort || 22,
        localPort: profile.localPort || 11434,
        remoteHost: profile.remoteHost || "127.0.0.1",
        remotePort: profile.remotePort || 11434,
      };
      reply(res, 200, tunnelStatus(spec));
      return;
    }
    if (req.method === "POST" && url.pathname === "/connections/als/cleanup") {
      const alsRoot = getSetting("alsRoot", process.env.ALS_ROOT || "/home/livingroom/Downloads/Autonomous-master");
      reply(res, 200, cleanupAlsProviders(resolveAlsPaths(alsRoot)));
      return;
    }
    if (req.method === "POST" && url.pathname === "/connections/als/register") {
      const body = JSON.parse((await readBody(req)) || "{}") as { serviceIndexes?: number[] };
      const report = await discoverNetwork();
      const picks = body.serviceIndexes?.length
        ? body.serviceIndexes.map((index) => report.services[index]).filter(Boolean)
        : report.services.filter((s) => s.reachable);
      const alsRoot = getSetting("alsRoot", process.env.ALS_ROOT || "/home/livingroom/Downloads/Autonomous-master");
      reply(res, 200, registerServicesInAls(resolveAlsPaths(alsRoot), picks));
      return;
    }
    if (req.method === "GET" && url.pathname === "/models") {
      reply(res, 200, await listStudioModels(studioSettings()));
      return;
    }
    if (req.method === "POST" && url.pathname === "/models/load") {
      const body = JSON.parse((await readBody(req)) || "{}") as { model?: string; gpuLayers?: number; nCtx?: number; threads?: number };
      const detail = await loadModel(studioSettings(), body.model || "", Number(body.gpuLayers ?? 100), Number(body.nCtx ?? 8192), Number(body.threads ?? 8));
      reply(res, 200, { ok: true, detail });
      return;
    }
    if (req.method === "POST" && url.pathname === "/models/unload") {
      const body = JSON.parse((await readBody(req)) || "{}") as { model?: string };
      const detail = await unloadModel(studioSettings(), body.model || "");
      reply(res, 200, { ok: true, detail });
      return;
    }
    if (req.method === "GET" && url.pathname === "/flows") {
      reply(res, 200, listFlows().map(({ graph: _graph, ...flow }) => flow));
      return;
    }
    if (req.method === "POST" && url.pathname === "/flows") {
      const body = JSON.parse((await readBody(req)) || "{}") as { id?: string; name?: string; graph?: Graph };
      if (!body.graph) throw new Error("Missing graph");
      const saved = saveFlow(body.id || crypto.randomUUID(), body.name || "Untitled mesh", body.graph);
      reply(res, 200, saved);
      return;
    }
    const flowMatch = url.pathname.match(/^\/flows\/([^/]+)$/);
    if (flowMatch && req.method === "GET") {
      const flow = getFlow(decodeURIComponent(flowMatch[1]));
      if (!flow) {
        reply(res, 404, { error: "Flow not found" });
        return;
      }
      reply(res, 200, flow);
      return;
    }
    if (flowMatch && req.method === "DELETE") {
      deleteFlow(decodeURIComponent(flowMatch[1]));
      reply(res, 200, { ok: true });
      return;
    }
    reply(res, 404, { error: "Not found" });
  } catch (cause) {
    reply(res, 400, { error: cause instanceof Error ? cause.message : String(cause) });
  }
}

function waitFor(runId: string, nodeId: string, signal: AbortSignal): Promise<WaitRequest> {
  const key = `${runId}:${nodeId}`;
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      waiters.delete(key);
      reject(new DOMException("The run was cancelled", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    waiters.set(key, (value) => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    });
  });
}

async function startRun(socket: WebSocket, body: { runId?: string; flowId?: string; input?: string; graph?: Graph }): Promise<void> {
  if (!body.graph || !Array.isArray(body.graph.nodes) || !Array.isArray(body.graph.edges)) {
    send(socket, { type: "error", error: "The run is missing a graph." });
    return;
  }
  if (active) {
    send(socket, { type: "error", error: "A run is already active." });
    return;
  }
  const runId = body.runId || crypto.randomUUID();
  const flowId = body.flowId || "unsaved";
  const controller = new AbortController();
  active = { id: runId, controller };
  recordRun(runId, flowId, "running");
  const settings = studioSettings();
  publish(runId, { kind: "log", text: "Run started." });
  try {
    const status = await runMesh(body.graph, body.input || "", {
      flowId,
      signal: controller.signal,
      emit: (event) => publish(runId, event),
      hardware: readHardware,
      recall: (agentId) => recall(flowId, agentId),
      remember: (agentId, role, content) => remember(flowId, agentId, role, content),
      waitHuman: (nodeId, mode, prompt, command) => {
        publish(runId, { kind: "wait", nodeId, mode, prompt, command });
        return waitFor(runId, nodeId, controller.signal);
      },
      invokeTool: async (node, tool, args) => {
        if (tool.data.kind !== "tool") return "Not a tool.";
        if (tool.data.approval) {
          const command = typeof args.command === "string" ? args.command : JSON.stringify(args);
          publish(runId, { kind: "wait", nodeId: node.id, mode: "approval", prompt: `${tool.data.label} is waiting for approval.`, command });
          const answer = await waitFor(runId, node.id, controller.signal);
          if (answer.decision === "reject") return "Operator rejected this tool call.";
        }
        return runTool(tool.data.server, args, {
          workspaceDir: settings.workspaceDir,
          mcpBridgeUrl: settings.mcpBridgeUrl,
          lmStudioUrl: settings.endpoint,
        });
      },
      complete: (node, llm, messages, tools, onToken) =>
        streamChat({
          endpoint: settings.endpoint,
          token: settings.token,
          model: llm.model,
          messages,
          tools: tools.length ? tools : undefined,
          temperature: llm.temperature,
          topP: llm.topP,
          topK: llm.topK,
          repeatPenalty: llm.repeatPenalty,
          signal: controller.signal,
          onToken,
        }).catch((cause: unknown) => {
          const detail = cause instanceof Error ? cause.message : String(cause);
          throw new Error(node.id ? detail : detail);
        }),
    });
    recordRun(runId, flowId, status === "ok" ? "done" : "error");
  } catch (cause) {
    const aborted = controller.signal.aborted || (cause instanceof Error && cause.name === "AbortError");
    publish(runId, { kind: "run", status: aborted ? "cancelled" : "error", detail: cause instanceof Error ? cause.message : String(cause) });
    recordRun(runId, flowId, aborted ? "cancelled" : "error");
  } finally {
    if (active?.id === runId) active = null;
  }
}

function onSocketMessage(socket: WebSocket, raw: WebSocket.RawData): void {
  let message: { type?: string; runId?: string; nodeId?: string; decision?: WaitRequest["decision"]; text?: string; flowId?: string; input?: string; graph?: Graph };
  try {
    message = JSON.parse(String(raw)) as typeof message;
  } catch {
    send(socket, { type: "error", error: "Invalid message." });
    return;
  }
  if (message.type === "run") {
    void startRun(socket, message);
    return;
  }
  if (message.type === "cancel" && message.runId && active?.id === message.runId) {
    active.controller.abort();
    return;
  }
  if (message.type === "human" && message.runId && message.nodeId) {
    const resolve = waiters.get(`${message.runId}:${message.nodeId}`);
    if (!resolve) return;
    waiters.delete(`${message.runId}:${message.nodeId}`);
    resolve({ decision: message.decision || "note", text: message.text || "" });
  }
}

fs.mkdirSync(defaultWorkspace, { recursive: true });
ensureExample();

const server = http.createServer((req, res) => {
  void handleHttp(req, res);
});
server.requestTimeout = 0;
server.headersTimeout = 0;

const sockets = new WebSocketServer({ server, path: "/ws" });
sockets.on("connection", (socket) => {
  clients.add(socket);
  send(socket, { type: "ready" });
  socket.on("message", (raw) => onSocketMessage(socket, raw));
  socket.on("close", () => clients.delete(socket));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`T.I.M. engine listening on http://127.0.0.1:${port}`);
});
