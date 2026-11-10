"use client";

import { ExternalLink, FolderInput, Library, Play, Save, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMesh } from "@/store/mesh";

export function TopBar({
  onRun,
  onStop,
  onSave,
  onImport,
  onExportAls,
}: {
  onRun: () => void;
  onStop: () => void;
  onSave: () => void;
  onImport: () => void;
  onExportAls: () => void;
}) {
  const flowName = useMesh((state) => state.flowName);
  const setFlowName = useMesh((state) => state.setFlowName);
  const task = useMesh((state) => state.task);
  const setTask = useMesh((state) => state.setTask);
  const runStatus = useMesh((state) => state.runStatus);
  const connected = useMesh((state) => state.connected);
  const hardware = useMesh((state) => state.hardware);
  const openPanel = useMesh((state) => state.openPanel);
  const studioView = useMesh((state) => state.studioView);
  const setStudioView = useMesh((state) => state.setStudioView);
  const alsApiUrl = useMesh((state) => state.settings.alsApiUrl || "http://127.0.0.1:8888");
  const isDirty = useMesh((state) => state.isDirty);
  const running = runStatus === "running";
  const vram = hardware?.vramUsedMb;
  const dirty = isDirty();
  return (
    <header className="flex h-14 shrink-0 flex-wrap items-center gap-3 border-b border-lavender/35 bg-black px-4">
      <div className="w-[148px]">
        <div className="text-[15px] tracking-[0.22em] text-lavender-bright">T.I.M.</div>
        <div className="font-mono text-[10px] text-zinc-400">Tool & Instruction Manager</div>
      </div>
      <div className="flex items-center gap-1 border border-lavender/25 p-0.5">
        <button
          type="button"
          className={`px-2 py-1 font-mono text-[10px] tracking-[0.12em] ${studioView === "mesh" ? "bg-lavender/20 text-lavender-bright" : "text-zinc-500 hover:text-zinc-300"}`}
          onClick={() => setStudioView("mesh")}
          data-testid="view-mesh"
        >
          MESH
        </button>
        <button
          type="button"
          className={`px-2 py-1 font-mono text-[10px] tracking-[0.12em] ${studioView === "als" ? "bg-lavender/20 text-lavender-bright" : "text-zinc-500 hover:text-zinc-300"}`}
          onClick={() => setStudioView("als")}
          data-testid="view-als"
        >
          ALS
        </button>
        <button
          type="button"
          title="Open Autonomous Loop Studio in a new browser tab"
          className="flex items-center gap-0.5 border-l border-lavender/25 px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-zinc-500 hover:text-lavender-bright"
          onClick={() => window.open(alsApiUrl.replace(/\/$/, ""), "_blank", "noopener,noreferrer")}
          data-testid="open-als-tab"
        >
          <ExternalLink size={11} aria-hidden />
          TAB
        </button>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Input aria-label="Flow name" value={flowName} onChange={(event) => setFlowName(event.target.value)} className="w-36 border-lavender/30 text-zinc-100" />
        {dirty && (
          <span className="font-mono text-[10px] tracking-[0.12em] text-amber-300" title="Unsaved changes">
            UNSAVED
          </span>
        )}
      </div>
      <Input aria-label="Task" value={task} onChange={(event) => setTask(event.target.value)} className="min-w-[12rem] flex-1 border-lavender/30 text-zinc-100" placeholder="Task for the mesh" />
      <Button variant="outline" onClick={onImport} data-testid="import-flow">
        <FolderInput size={12} /> Import
      </Button>
      <Button variant="outline" onClick={onExportAls} data-testid="export-als">
        → ALS
      </Button>
      <Button variant="outline" onClick={onSave} data-testid="save-flow">
        <Save size={12} /> Save
      </Button>
      {running ? (
        <Button variant="outline" onClick={onStop} data-testid="stop-run">
          <Square size={12} /> Stop
        </Button>
      ) : (
        <Button onClick={onRun} data-testid="run-mesh">
          <Play size={12} /> Run
        </Button>
      )}
      <Button variant="ghost" onClick={() => openPanel("models")} data-testid="open-models">
        <Library size={14} /> Models
      </Button>
      <div className="hidden items-center gap-3 font-mono text-[10px] text-olive-bright xl:flex">
        <span className={`h-1.5 w-1.5 ${connected ? "bg-olive-bright" : "bg-zinc-600"}`} />
        {hardware ? (
          <>
            <span>RAM {hardware.ramPercent}%</span>
            {typeof vram === "number" && hardware.vramTotalMb && (
              <span>
                VRAM {(vram / 1024).toFixed(1)}/{(hardware.vramTotalMb / 1024).toFixed(1)} GB
              </span>
            )}
            {typeof hardware.gpuPercent === "number" && <span>GPU {hardware.gpuPercent}%</span>}
          </>
        ) : (
          <span className="text-zinc-500">metrics idle</span>
        )}
      </div>
    </header>
  );
}
