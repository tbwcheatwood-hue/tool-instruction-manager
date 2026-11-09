"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";
import {
  EXAMPLE_FLOW_ID,
  createNode,
  createToolNode,
  exampleGraph,
  flowFingerprint,
  relationFromHandles,
  serializeGraph,
  type EngineEvent,
  type FlowRecord,
  type GraphEdge,
  type GraphNode,
  type Hardware,
  type LocalModel,
  type NodeData,
  type NodeKind,
  type Relation,
  type ToolServer,
} from "../../shared/mesh";
import { engineFetch, type ModelResponse, type Settings } from "@/lib/engine";

export type Runtime = {
  status: "idle" | "running" | "ok" | "error" | "wait";
  stream: string;
  tps?: number;
  ttftMs?: number;
  hardware?: Hardware;
};

export type LogLine = { id: string; text: string; tone: "meta" | "text" | "tool" | "error" };

export type Pending = { nodeId: string; mode: "human" | "approval"; prompt: string; command?: string };

type MeshState = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  flowId: string;
  flowName: string;
  flows: { id: string; name: string; updatedAt: string }[];
  task: string;
  savedFingerprint: string;
  runtime: Record<string, Runtime>;
  activeEdgeIds: string[];
  log: LogLine[];
  runId: string | null;
  runStatus: "idle" | "running" | "ok" | "error" | "cancelled";
  pending: Pending[];
  panel: "node" | "models";
  panelOpen: boolean;
  transcriptOpen: boolean;
  connected: boolean;
  hardware: Hardware | null;
  models: LocalModel[];
  modelsOnline: boolean;
  modelsError: string;
  settings: Settings;
  notice: string;
  importOpen: boolean;
  leftRail: "components" | "connections";
  studioView: "mesh" | "als";
  isDirty: () => boolean;
  commitFingerprint: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  setFlowName: (name: string) => void;
  setTask: (task: string) => void;
  updateNode: (id: string, patch: Partial<NodeData>) => void;
  updateEdgeRelation: (id: string, relation: Relation) => void;
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => void;
  addToolNode: (server: ToolServer, position?: { x: number; y: number }) => void;
  loadGraph: (flow: FlowRecord) => void;
  setFlows: (flows: MeshState["flows"]) => void;
  openPanel: (panel: "node" | "models") => void;
  setPanelOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
  setLeftRail: (rail: "components" | "connections") => void;
  setStudioView: (view: "mesh" | "als") => void;
  setTranscriptOpen: (open: boolean) => void;
  setConnected: (connected: boolean) => void;
  setHardware: (hardware: Hardware) => void;
  setNotice: (notice: string) => void;
  setSettings: (settings: Settings) => void;
  beginRun: () => { runId: string; graph: ReturnType<typeof serializeGraph> };
  applyEvent: (runId: string, event: EngineEvent) => void;
  answer: (decision: "approve" | "reject" | "note", text: string) => { runId: string; nodeId: string; decision: "approve" | "reject" | "note"; text: string } | null;
  refreshModels: () => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  loadModel: (nodeId: string) => Promise<void>;
  unloadModel: (nodeId: string) => Promise<void>;
};

const initial = exampleGraph();

function line(text: string, tone: LogLine["tone"]): LogLine {
  return { id: crypto.randomUUID(), text, tone };
}

function fingerprintOf(state: Pick<MeshState, "flowName" | "task" | "nodes" | "edges">): string {
  return flowFingerprint(state.flowName, state.task, state.nodes, state.edges);
}

export const useMesh = create<MeshState>((set, get) => ({
  nodes: initial.nodes,
  edges: initial.edges,
  flowId: EXAMPLE_FLOW_ID,
  flowName: "Mesh",
  flows: [],
  task: "List the workspace, then say whether this should be written up or reviewed.",
  savedFingerprint: flowFingerprint("Mesh", "List the workspace, then say whether this should be written up or reviewed.", initial.nodes, initial.edges),
  runtime: {},
  activeEdgeIds: [],
  log: [],
  runId: null,
  runStatus: "idle",
  pending: [],
  panel: "node",
  panelOpen: true,
  transcriptOpen: false,
  connected: false,
  hardware: null,
  models: [],
  modelsOnline: false,
  modelsError: "",
  settings: {
    lmStudioUrl: "http://127.0.0.1:1234",
    modelsDir: "",
    workspaceDir: "",
    mcpBridgeUrl: "",
    alsRoot: "/home/livingroom/Downloads/Autonomous-master",
    alsApiUrl: "http://127.0.0.1:8080",
  },
  notice: "",
  importOpen: false,
  leftRail: "components",
  studioView: "mesh",
  isDirty: () => {
    const state = get();
    if (!state.savedFingerprint) return state.nodes.length > 0;
    return fingerprintOf(state) !== state.savedFingerprint;
  },
  commitFingerprint: () => set({ savedFingerprint: fingerprintOf(get()) }),
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes as never) as GraphNode[] }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges as never) as GraphEdge[] }),
  onConnect: (connection) => {
    if (!connection.source || !connection.target) return;
    set({
      edges: addEdge(
        {
          ...connection,
          id: `e-${crypto.randomUUID().slice(0, 8)}`,
          type: "mesh",
          data: { relation: relationFromHandles(connection.sourceHandle, connection.targetHandle) },
        },
        get().edges as never,
      ) as GraphEdge[],
    });
  },
  setFlowName: (flowName) => set({ flowName }),
  setTask: (task) => set({ task }),
  updateNode: (id, patch) =>
    set({
      nodes: get().nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...patch } as NodeData } : node)),
    }),
  updateEdgeRelation: (id, relation) =>
    set({ edges: get().edges.map((edge) => (edge.id === id ? { ...edge, data: { relation } } : edge)) }),
  addNode: (kind, position) => {
    const count = get().nodes.length;
    const node = createNode(kind, position ?? { x: 180 + (count % 4) * 28, y: 140 + (count % 5) * 28 });
    set({ nodes: [...get().nodes, node] });
  },
  addToolNode: (server, position) => {
    const count = get().nodes.length;
    const node = createToolNode(server, position ?? { x: 180 + (count % 4) * 28, y: 140 + (count % 5) * 28 });
    set({ nodes: [...get().nodes, node] });
  },
  loadGraph: (flow) => {
    set({
      flowId: flow.id,
      flowName: flow.name,
      nodes: flow.graph.nodes,
      edges: flow.graph.edges.map((edge) => ({ ...edge, type: edge.type ?? "mesh" })),
      runtime: {},
      activeEdgeIds: [],
      pending: [],
      runStatus: "idle",
      runId: null,
    });
    get().commitFingerprint();
  },
  setFlows: (flows) => set({ flows }),
  openPanel: (panel) => set({ panel, panelOpen: true }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setImportOpen: (importOpen) => set({ importOpen }),
  setLeftRail: (leftRail) => set({ leftRail }),
  setStudioView: (studioView) => set({ studioView }),
  setTranscriptOpen: (transcriptOpen) => set({ transcriptOpen }),
  setConnected: (connected) => set({ connected }),
  setHardware: (hardware) => set({ hardware }),
  setNotice: (notice) => set({ notice }),
  setSettings: (settings) => set({ settings }),
  beginRun: () => {
    const runId = crypto.randomUUID();
    set({ runId, runStatus: "running", log: [], runtime: {}, activeEdgeIds: [], pending: [], notice: "", transcriptOpen: true });
    return { runId, graph: serializeGraph(get().nodes, get().edges) };
  },
  applyEvent: (runId, event) => {
    if (get().runId && runId !== get().runId) return;
    if (event.kind === "edge") {
      const activeEdgeIds = event.active ? [...new Set([...get().activeEdgeIds, event.edgeId])] : get().activeEdgeIds.filter((id) => id !== event.edgeId);
      set({ activeEdgeIds });
      return;
    }
    if (event.kind === "node") {
      set({
        runtime: {
          ...get().runtime,
          [event.nodeId]: { ...(get().runtime[event.nodeId] ?? { stream: "" }), status: event.status === "idle" ? "idle" : event.status },
        },
      });
      if (event.detail) set({ log: [...get().log, line(event.detail, event.status === "error" ? "error" : "meta")].slice(-200) });
      return;
    }
    if (event.kind === "token") {
      const current = get().runtime[event.nodeId] ?? { status: "running" as const, stream: "" };
      set({
        runtime: {
          ...get().runtime,
          [event.nodeId]: { ...current, status: "running", stream: `${current.stream}${event.text}`.slice(-4000) },
        },
      });
      return;
    }
    if (event.kind === "metric") {
      const current = get().runtime[event.nodeId] ?? { status: "running" as const, stream: "" };
      set({
        runtime: { ...get().runtime, [event.nodeId]: { ...current, tps: event.tps, ttftMs: event.ttftMs, hardware: event.hardware } },
        hardware: event.hardware,
      });
      return;
    }
    if (event.kind === "tool") {
      const current = get().runtime[event.nodeId] ?? { status: "running" as const, stream: "" };
      set({
        runtime: { ...get().runtime, [event.nodeId]: { ...current, status: event.state === "error" ? "error" : "running" } },
        log: [...get().log, line(`${event.server} ${event.state}: ${event.detail}`, event.state === "error" ? "error" : "tool")].slice(-200),
      });
      return;
    }
    if (event.kind === "wait") {
      const current = get().runtime[event.nodeId] ?? { status: "wait" as const, stream: "" };
      const pending = get().pending.filter((item) => item.nodeId !== event.nodeId);
      set({
        runtime: { ...get().runtime, [event.nodeId]: { ...current, status: "wait" } },
        pending: [...pending, { nodeId: event.nodeId, mode: event.mode, prompt: event.prompt, command: event.command }],
      });
      return;
    }
    if (event.kind === "log") {
      set({ log: [...get().log, line(event.text, "meta")].slice(-200) });
      return;
    }
    set({
      runStatus: event.status,
      pending: [],
      activeEdgeIds: [],
      log: [...get().log, line(event.detail || event.status, event.status === "ok" ? "tool" : "error")].slice(-200),
    });
  },
  answer: (decision, text) => {
    const pending = get().pending[0];
    const runId = get().runId;
    if (!pending || !runId) return null;
    set({ pending: get().pending.slice(1) });
    return { runId, nodeId: pending.nodeId, decision, text };
  },
  refreshModels: async () => {
    const body = await engineFetch<ModelResponse>("/models");
    set({ models: body.models, modelsOnline: body.online, modelsError: body.error });
  },
  saveSettings: async (patch) => {
    const settings = await engineFetch<Settings>("/settings", { method: "PUT", body: JSON.stringify(patch) });
    set({ settings });
  },
  loadModel: async (nodeId) => {
    const node = get().nodes.find((item) => item.id === nodeId);
    if (!node || node.data.kind !== "llm") return;
    set({ notice: "Loading model…" });
    try {
      await engineFetch("/models/load", {
        method: "POST",
        body: JSON.stringify({ model: node.data.model, gpuLayers: node.data.gpuLayers, nCtx: node.data.nCtx, threads: node.data.threads }),
      });
      set({ notice: "Model loaded." });
      await get().refreshModels();
    } catch (cause) {
      set({ notice: cause instanceof Error ? cause.message : String(cause) });
    }
  },
  unloadModel: async (nodeId) => {
    const node = get().nodes.find((item) => item.id === nodeId);
    if (!node || node.data.kind !== "llm") return;
    set({ notice: "Unloading model…" });
    try {
      await engineFetch("/models/unload", { method: "POST", body: JSON.stringify({ model: node.data.model }) });
      set({ notice: "Model unloaded." });
      await get().refreshModels();
    } catch (cause) {
      set({ notice: cause instanceof Error ? cause.message : String(cause) });
    }
  },
}));
