import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { connectionKind, connectionLabel } from "../shared/connection";
import type { Artifact, NodeKind, ProviderPublic, RunEvent, RunStatus, Workflow } from "../shared/types";
import { api, watchRun, type RunSummary } from "./api";
import { Chat } from "./Chat";
import { createFlowNode, toFlow, toWorkflow, type NodeData } from "./flow";
import { Inspector } from "./Inspector";
import { Monitor } from "./Monitor";
import { nodeTypes } from "./nodes";
import { StudioPanel } from "./StudioPanel";

const PALETTE: { kind: NodeKind; blurb: string }[] = [
  { kind: "input", blurb: "Run payload" },
  { kind: "agent", blurb: "Model step" },
  { kind: "tool", blurb: "Local action" },
  { kind: "branch", blurb: "Pass or fail" },
  { kind: "reviewer", blurb: "Check claims" },
  { kind: "output", blurb: "Collect result" },
];

function Studio() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [name, setName] = useState("Untitled workflow");
  const [workflowId, setWorkflowId] = useState("");
  const [saved, setSaved] = useState<Workflow[]>([]);
  const [providers, setProviders] = useState<ProviderPublic[]>([]);
  const [inputText, setInputText] = useState("Weekly status: the report body.");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [status, setStatus] = useState<RunStatus | "idle">("idle");
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<"workflow" | "chat" | "studio">("workflow");
  const [activeProviderId, setActiveProviderId] = useState("simulated");
  const [providerForm, setProviderForm] = useState({ name: "Local endpoint", baseUrl: "http://127.0.0.1:11434/v1", model: "", apiKey: "" });
  const { screenToFlowPosition } = useReactFlow();

  const selected = useMemo(() => nodes.find((node) => node.selected) ?? null, [nodes]);

  const applyWorkflow = useCallback(
    (workflow: Workflow) => {
      const flow = toFlow(workflow);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setName(workflow.name);
      setWorkflowId(workflow.id);
    },
    [setEdges, setNodes],
  );

  const refreshLists = useCallback(async () => {
    const [workflowList, providerList, runList] = await Promise.all([api.workflows(), api.providers(), api.runs()]);
    setSaved(workflowList);
    setProviders(providerList);
    setHistory(runList);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refreshLists();
        const examples = await api.examples();
        applyWorkflow(examples[0]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    })();
  }, [applyWorkflow, refreshLists]);

  useEffect(() => {
    const statuses = new Map<string, string>();
    for (const event of events) {
      if (event.kind === "node_start") statuses.set(event.nodeId, event.status ?? "running");
      if (event.kind === "node_end" || event.kind === "error" || event.kind === "review") statuses.set(event.nodeId, event.status ?? "ok");
    }
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const nodeStatus = statuses.get(node.id) ?? "idle";
        if (node.data.status === nodeStatus) return node;
        changed = true;
        return { ...node, data: { ...node.data, status: nodeStatus } };
      });
      return changed ? next : current;
    });
  }, [events, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((current) => addEdge({ ...connection, label: connection.sourceHandle ?? undefined }, current)),
    [setEdges],
  );

  const addKind = (kind: NodeKind, position = { x: 160, y: 80 + nodes.length * 24 }) => {
    const node = { ...createFlowNode(kind, position), selected: true };
    setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), node]);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/agentlab") as NodeKind;
    if (!PALETTE.some((item) => item.kind === kind)) return;
    addKind(kind, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  const save = async () => {
    setError("");
    try {
      const workflow = toWorkflow(name, workflowId, nodes, edges);
      const stored = await api.saveWorkflow(workflow);
      setWorkflowId(stored.id);
      await refreshLists();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  const exportWorkflow = () => {
    const workflow = toWorkflow(name, workflowId || "draft", nodes, edges);
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${workflow.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importWorkflow = async (file: File) => {
    setError("");
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const stored = await api.importWorkflow(parsed);
      applyWorkflow(stored);
      await refreshLists();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    }
  };

  const run = async () => {
    setError("");
    setRunning(true);
    setEvents([]);
    setArtifacts([]);
    setStatus("running");
    try {
      let parsed: unknown = inputText;
      const trimmed = inputText.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) parsed = JSON.parse(trimmed);
      const workflow = toWorkflow(name, workflowId || "unsaved", nodes, edges);
      const { runId } = await api.startRun(workflow, parsed);
      const stop = watchRun(
        runId,
        (event) => setEvents((current) => (current.some((item) => item.seq === event.seq) ? current : [...current, event])),
        () => undefined,
      );
      let finished = await api.run(runId);
      for (let attempt = 0; attempt < 100 && finished.status === "running"; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        finished = await api.run(runId);
      }
      stop();
      setStatus(finished.status);
      setArtifacts(finished.artifacts);
      setEvents(finished.events);
      if (finished.error) setError(finished.error);
      await refreshLists();
    } catch (runError) {
      setStatus("error");
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setRunning(false);
    }
  };

  const showHistory = async (id: string) => {
    setError("");
    try {
      const stored = await api.run(id);
      setEvents(stored.events);
      setArtifacts(stored.artifacts);
      setStatus(stored.status);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : String(historyError));
    }
  };

  const addProvider = async () => {
    setError("");
    try {
      await api.createProvider(providerForm);
      setProviderForm({ ...providerForm, apiKey: "" });
      setProviders(await api.providers());
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : String(providerError));
    }
  };

  const testProvider = async (id: string) => {
    setError("");
    setNote("");
    try {
      const result = await api.testProvider(id);
      setNote(result.simulated ? result.message ?? "Simulated provider." : `Endpoint replied: ${result.text ?? "ok"}`);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : String(testError));
    }
  };

  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? providers[0];

  return (
    <div className={`app view-${view}`}>
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true">AR</span>
          <div>
            <h1>Agent Routing Lab</h1>
            <p>Workflow, chat, and Loop Studio</p>
          </div>
        </div>
        <nav className="view-switch" aria-label="Workspace">
          <button type="button" className={view === "workflow" ? "primary" : "ghost"} aria-pressed={view === "workflow"} onClick={() => setView("workflow")}>
            Workflow
          </button>
          <button type="button" className={view === "chat" ? "primary" : "ghost"} aria-pressed={view === "chat"} onClick={() => setView("chat")}>
            Chat
          </button>
          <button type="button" className={view === "studio" ? "primary" : "ghost"} aria-pressed={view === "studio"} onClick={() => setView("studio")}>
            Loop Studio
          </button>
        </nav>
        {activeProvider && <span className={`pill connection-${connectionKind(activeProvider)}`}>Active: {connectionLabel(activeProvider)}</span>}
        {view === "workflow" && (
          <>
            <div className="workflow-group">
              <label>
                Workflow
                <input aria-label="Workflow name" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Open
                <select
                  aria-label="Saved workflows"
                  value={workflowId}
                  onChange={(event) => {
                    const workflow = saved.find((item) => item.id === event.target.value);
                    if (workflow) applyWorkflow(workflow);
                  }}
                >
                  {!saved.some((item) => item.id === workflowId) && <option value={workflowId}>Unsaved canvas</option>}
                  {saved.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="action-group">
              <button type="button" className="primary" onClick={() => void save()}>
                Save
              </button>
              <button type="button" className="ghost" onClick={exportWorkflow}>
                Export
              </button>
              <label className="ghost file">
                Import
                <input
                  aria-label="Import workflow JSON"
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importWorkflow(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="example-group" aria-label="Examples">
              <span>Examples</span>
              <button type="button" className="ghost" onClick={() => void api.examples().then((items) => applyWorkflow(items[0]))}>
                Pass
              </button>
              <button type="button" className="ghost" onClick={() => void api.examples().then((items) => applyWorkflow(items[1]))}>
                Reject
              </button>
              <button type="button" className="ghost" onClick={() => void api.examples().then((items) => applyWorkflow(items[2]))}>
                Branch
              </button>
            </div>
          </>
        )}
      </header>
      {view === "chat" && (
        <Chat
          providers={providers}
          activeId={activeProvider?.id ?? "simulated"}
          onActive={setActiveProviderId}
          onCreate={async (form) => {
            const created = await api.createProvider(form);
            setProviders(await api.providers());
            setActiveProviderId(created.id);
          }}
          onTest={async (id) => {
            await testProvider(id);
            setActiveProviderId(id);
          }}
        />
      )}
      {view === "studio" && <StudioPanel />}
      {view === "workflow" && (
      <>
      <div className="body">
        <aside className="palette">
          <section>
            <h2>Add a step</h2>
            <p className="hint">Click to place a node, or drag it onto the canvas.</p>
            <div className="palette-list">
              {PALETTE.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  className={`palette-item kind-${item.kind}`}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("application/agentlab", item.kind)}
                  onClick={() => addKind(item.kind)}
                >
                  <strong>{item.kind}</strong>
                  <span>{item.blurb}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="provider">
            <h2>Providers</h2>
            <p className="hint">Simulated stays on this machine. An OpenAI-compatible endpoint uses the base URL you save.</p>
            <div className="provider-list">
              {providers.map((provider) => (
                <article key={provider.id} className={`provider-card ${provider.id === activeProvider?.id ? "is-active" : ""}`}>
                  <button type="button" className="ghost provider-pick" onClick={() => setActiveProviderId(provider.id)}>
                    <strong>{provider.name}</strong>
                    <span className={`connection connection-${connectionKind(provider)}`}>{connectionLabel(provider)}</span>
                  </button>
                  <button type="button" className="ghost" onClick={() => void testProvider(provider.id)}>
                    Test
                  </button>
                </article>
              ))}
            </div>
            <details className="endpoint-form">
              <summary>Add endpoint</summary>
              <FieldLine label="Name" value={providerForm.name} onChange={(next) => setProviderForm({ ...providerForm, name: next })} />
              <FieldLine label="Base URL" value={providerForm.baseUrl} onChange={(baseUrl) => setProviderForm({ ...providerForm, baseUrl })} />
              <FieldLine label="Model" value={providerForm.model} onChange={(model) => setProviderForm({ ...providerForm, model })} />
              <FieldLine label="API key" value={providerForm.apiKey} onChange={(apiKey) => setProviderForm({ ...providerForm, apiKey })} secret />
              <button type="button" className="primary" onClick={() => void addProvider()}>
                Save endpoint
              </button>
            </details>
          </section>
        </aside>
        <main className="canvas" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            colorMode="dark"
            fitView
          >
            <Background color="#3a2d55" gap={22} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </main>
        <aside className="inspector-wrap">
          <Inspector
            node={selected}
            providers={providers}
            onChange={(next) => setNodes((current) => current.map((node) => (node.id === next.id ? next : node)))}
          />
        </aside>
      </div>
      <Monitor
        inputText={inputText}
        onInput={setInputText}
        events={events}
        artifacts={artifacts}
        status={status}
        history={history}
        error={error}
        note={note}
        running={running}
        onRun={() => void run()}
        onSelectHistory={(id) => void showHistory(id)}
      />
      </>
      )}
    </div>
  );
}

function FieldLine({ label, value, onChange, secret }: { label: string; value: string; onChange: (value: string) => void; secret?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={secret ? "password" : "text"} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <Studio />
    </ReactFlowProvider>
  );
}
