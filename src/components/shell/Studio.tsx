"use client";

import { useEffect, useRef, useState } from "react";
import { HumanBar } from "@/components/shell/HumanBar";
import { ExportAlsDialog } from "@/components/shell/ExportAlsDialog";
import { ImportDialog } from "@/components/shell/ImportDialog";
import { TopBar } from "@/components/shell/TopBar";
import { AlsStudio } from "@/components/shell/AlsStudio";
import { MeshWorkspace } from "@/components/shell/MeshWorkspace";
import { Transcript } from "@/components/shell/Transcript";
import { ENGINE_WS, engineFetch, type Settings } from "@/lib/engine";
import type { AlsBridgeResult } from "../../../shared/alsRouting";
import { createNode, serializeGraph, type FlowRecord } from "../../../shared/mesh";
import { useMesh } from "@/store/mesh";

export function Studio() {
  return <StudioInner />;
}

function StudioInner() {
  const socketRef = useRef<WebSocket | null>(null);
  const notice = useMesh((state) => state.notice);
  const studioView = useMesh((state) => state.studioView);
  const setConnected = useMesh((state) => state.setConnected);
  const setNotice = useMesh((state) => state.setNotice);
  const setHardware = useMesh((state) => state.setHardware);
  const applyEvent = useMesh((state) => state.applyEvent);
  const beginRun = useMesh((state) => state.beginRun);
  const loadGraph = useMesh((state) => state.loadGraph);
  const setFlows = useMesh((state) => state.setFlows);
  const setSettings = useMesh((state) => state.setSettings);
  const answer = useMesh((state) => state.answer);
  const importOpen = useMesh((state) => state.importOpen);
  const setImportOpen = useMesh((state) => state.setImportOpen);
  const setStudioView = useMesh((state) => state.setStudioView);
  const commitFingerprint = useMesh((state) => state.commitFingerprint);
  const [exportAlsOpen, setExportAlsOpen] = useState(false);
  const [exportAlsLoading, setExportAlsLoading] = useState(false);
  const [exportAlsResult, setExportAlsResult] = useState<AlsBridgeResult | null>(null);
  const [exportAlsError, setExportAlsError] = useState("");

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      socket = new WebSocket(ENGINE_WS);
      socketRef.current = socket;
      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        if (!stopped) timer = setTimeout(connect, 1500);
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as { type?: string; runId?: string; event?: Parameters<typeof applyEvent>[1]; error?: string };
        if (message.type === "event" && message.runId && message.event) applyEvent(message.runId, message.event);
        if (message.type === "error" && message.error) setNotice(message.error);
      };
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [applyEvent, setConnected, setNotice]);

  useEffect(() => {
    void (async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          const flows = await engineFetch<{ id: string; name: string; updatedAt: string }[]>("/flows");
          setFlows(flows);
          const current = flows[0];
          if (current) loadGraph(await engineFetch<FlowRecord>(`/flows/${current.id}`));
          setSettings(await engineFetch<Settings>("/settings"));
          return;
        } catch (cause) {
          if (attempt === 7) setNotice(cause instanceof Error ? cause.message : String(cause));
          else await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
    })();
  }, [loadGraph, setFlows, setNotice, setSettings]);

  useEffect(() => {
    const tick = () => {
      void engineFetch<Parameters<typeof setHardware>[0]>("/hardware")
        .then(setHardware)
        .catch(() => undefined);
    };
    tick();
    const timer = setInterval(tick, 4000);
    return () => clearInterval(timer);
  }, [setHardware]);

  const importFlow = (flow: FlowRecord, external?: import("../../../shared/workflowImport").ImportConversionResult) => {
    const state = useMesh.getState();
    if (state.isDirty()) {
      const ok = window.confirm("This mesh has unsaved changes. Import anyway and discard them?");
      if (!ok) return;
    }
    loadGraph(flow);
    if (external?.summary?.length) {
      const warnings = external.summary.filter((line) => line.severity !== "ok").length;
      setNotice(
        `Imported ${flow.name} from ${external.detectedSource} (${warnings} note${warnings === 1 ? "" : "s"}). Rewire brain/tool edges before Run.`,
      );
    } else {
      setNotice(`Imported ${flow.name}.`);
    }
  };

  const run = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setNotice("The mesh engine is not connected.");
      return;
    }
    const { runId, graph } = beginRun();
    const { flowId, task } = useMesh.getState();
    socket.send(JSON.stringify({ type: "run", runId, flowId, input: task, graph }));
  };

  const stop = () => {
    const { runId } = useMesh.getState();
    if (!runId) return;
    socketRef.current?.send(JSON.stringify({ type: "cancel", runId }));
  };

  const save = async () => {
    const { flowId, flowName, nodes, edges, setFlows: rememberFlows } = useMesh.getState();
    try {
      const saved = await engineFetch<FlowRecord>("/flows", {
        method: "POST",
        body: JSON.stringify({ id: flowId, name: flowName, graph: serializeGraph(nodes, edges) }),
      });
      const flows = await engineFetch<{ id: string; name: string; updatedAt: string }[]>("/flows");
      rememberFlows(flows);
      commitFingerprint();
      setNotice(`Saved ${saved.name}.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const beginExportAls = () => {
    const state = useMesh.getState();
    if (state.isDirty()) {
      const ok = window.confirm("Unsaved mesh changes will be exported from the canvas (not the last save). Continue?");
      if (!ok) return;
    }
    setExportAlsOpen(true);
    setExportAlsResult(null);
    setExportAlsError("");
    setExportAlsLoading(true);
    const { flowId, flowName, nodes, edges } = state;
    void engineFetch<AlsBridgeResult>("/workflows/export-als", {
      method: "POST",
      body: JSON.stringify({
        flowId,
        name: flowName,
        graph: serializeGraph(nodes, edges),
        push: false,
      }),
    })
      .then(setExportAlsResult)
      .catch((cause: unknown) => setExportAlsError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setExportAlsLoading(false));
  };

  const pushExportAls = () => {
    const state = useMesh.getState();
    setExportAlsLoading(true);
    const { flowId, flowName, nodes, edges } = state;
    void engineFetch<AlsBridgeResult>("/workflows/export-als", {
      method: "POST",
      body: JSON.stringify({
        flowId,
        name: flowName,
        graph: serializeGraph(nodes, edges),
        push: true,
        pipelineId: exportAlsResult?.pipelineId,
      }),
    })
      .then((result) => {
        setExportAlsResult(result);
        const created = result.agentsTouched?.created.length ?? 0;
        setNotice(
          `Pushed "${result.name}" to ALS routing charts (${created} new agent${created === 1 ? "" : "s"}). Open ALS → Routing chart.`,
        );
        setStudioView("als");
        setExportAlsOpen(false);
      })
      .catch((cause: unknown) => setExportAlsError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setExportAlsLoading(false));
  };

  const fresh = () => {
    const agent = createNode("agent", { x: 80, y: 220 });
    const llm = createNode("llm", { x: 80, y: 40 });
    useMesh.setState({
      flowId: crypto.randomUUID(),
      flowName: "Untitled mesh",
      nodes: [llm, agent],
      edges: [
        {
          id: `e-${crypto.randomUUID().slice(0, 8)}`,
          source: llm.id,
          target: agent.id,
          sourceHandle: "brain",
          targetHandle: "brain",
          type: "mesh",
          data: { relation: "brain" },
        },
      ],
      runtime: {},
      runStatus: "idle",
      runId: null,
    });
    useMesh.getState().commitFingerprint();
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-black text-zinc-100">
      <TopBar
        onRun={run}
        onStop={stop}
        onSave={() => void save()}
        onImport={() => setImportOpen(true)}
        onExportAls={beginExportAls}
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={importFlow} />
      <ExportAlsDialog
        open={exportAlsOpen}
        loading={exportAlsLoading}
        result={exportAlsResult}
        error={exportAlsError}
        onClose={() => setExportAlsOpen(false)}
        onPush={pushExportAls}
      />
      {notice && (
        <div className="border-b border-lavender/20 px-4 py-1 font-mono text-[11px] text-lavender" data-testid="notice">
          {notice}
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {studioView === "mesh" ? <MeshWorkspace /> : <AlsStudio />}
      </div>
      {studioView === "mesh" && (
        <>
          <div className="flex justify-end border-t border-white/5 px-4">
            <button type="button" className="py-1 font-mono text-[10px] tracking-[0.14em] text-zinc-600 hover:text-lavender" onClick={fresh}>
              NEW MESH
            </button>
          </div>
          <HumanBar
            onAnswer={(decision, text) => {
              const payload = answer(decision, text);
              if (!payload) return;
              socketRef.current?.send(JSON.stringify({ type: "human", ...payload }));
            }}
          />
          <Transcript />
        </>
      )}
    </div>
  );
}
