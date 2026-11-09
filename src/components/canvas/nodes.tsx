"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";
import { toolPreset, type AgentData, type LlmData, type RouterData, type ToolData } from "../../../shared/mesh";
import { useMesh, type Runtime } from "@/store/mesh";

function Dot({ status }: { status: Runtime["status"] | undefined }) {
  const color = status === "ok" ? "bg-olive shadow-olive" : status === "error" ? "bg-lavender-dim" : status === "running" || status === "wait" ? "bg-lavender" : "bg-zinc-700";
  return <span className={`h-1.5 w-1.5 ${color}`} />;
}

function Frame({
  kind,
  title,
  status,
  selected,
  children,
}: {
  kind: string;
  title: string;
  status?: Runtime["status"];
  selected?: boolean;
  children?: ReactNode;
}) {
  const live = status === "running" || status === "wait";
  return (
    <div
      className={`w-[240px] border bg-zinc-950/90 px-3 py-2.5 backdrop-blur-md ${live ? "mesh-live border-lavender-bright" : selected ? "border-lavender-bright shadow-glow" : status === "ok" ? "border-olive-bright/70" : "border-lavender/45"}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.18em] text-lavender-bright">{kind}</span>
        <Dot status={status} />
      </div>
      <div className="mt-1 truncate text-[13px] text-zinc-100">{title}</div>
      {children}
    </div>
  );
}

function Metrics({ runtime }: { runtime?: Runtime }) {
  if (!runtime?.tps && !runtime?.hardware) return null;
  const vram = runtime.hardware?.vramUsedMb;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 font-mono text-[10px] text-olive">
      {typeof runtime.tps === "number" && <span>{runtime.tps.toFixed(1)} t/s</span>}
      {typeof runtime.ttftMs === "number" && <span>{runtime.ttftMs} ms</span>}
      {runtime.hardware && <span>RAM {runtime.hardware.ramPercent}%</span>}
      {typeof vram === "number" && runtime.hardware?.vramTotalMb && (
        <span>
          VRAM {(vram / 1024).toFixed(1)}/{(runtime.hardware.vramTotalMb / 1024).toFixed(1)} GB
        </span>
      )}
    </div>
  );
}

export function AgentNode({ id, data, selected }: NodeProps) {
  const agent = data as AgentData;
  const runtime = useMesh((state) => state.runtime[id]);
  return (
    <Frame kind="AGENT" title={agent.name || "Agent"} status={runtime?.status} selected={selected}>
      <p className="mt-1 truncate text-[11px] text-zinc-300">{agent.role}</p>
      {runtime?.stream && <p className="mt-2 line-clamp-3 font-mono text-[10px] leading-relaxed text-lavender-bright">{runtime.stream}</p>}
      <Metrics runtime={runtime} />
      <Handle id="flow-in" type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border !border-black !bg-lavender-bright" />
      <Handle id="flow-out" type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border !border-black !bg-lavender-bright" />
      <Handle id="brain" type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border !border-black !bg-lavender-bright" />
      <Handle id="tool" type="target" position={Position.Bottom} className="!h-2.5 !w-2.5 !border !border-black !bg-olive-bright" />
    </Frame>
  );
}

export function LlmNode({ id, data, selected }: NodeProps) {
  const llm = data as LlmData;
  const runtime = useMesh((state) => state.runtime[id]);
  const loadModel = useMesh((state) => state.loadModel);
  return (
    <Frame kind="LOCAL LLM" title={llm.model || "No model"} status={runtime?.status} selected={selected}>
      <p className="mt-1 font-mono text-[10px] text-zinc-300">
        GPU {llm.gpuLayers}% · ctx {llm.nCtx} · t {llm.temperature}
      </p>
      {runtime?.stream && <p className="mt-2 line-clamp-3 font-mono text-[10px] leading-relaxed text-lavender/80">{runtime.stream}</p>}
      <Metrics runtime={runtime} />
      <button type="button" className="nodrag nopan mt-2 font-mono text-[10px] tracking-[0.14em] text-lavender" onClick={() => void loadModel(id)}>
        LOAD
      </button>
      <Handle id="brain" type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border !border-black !bg-lavender-bright" />
    </Frame>
  );
}

export function ToolNode({ id, data, selected }: NodeProps) {
  const tool = data as ToolData;
  const runtime = useMesh((state) => state.runtime[id]);
  const meta = toolPreset(tool.server);
  return (
    <Frame kind="MCP TOOL" title={tool.label || meta?.label || tool.server} status={runtime?.status} selected={selected}>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-olive-bright">{meta?.category ?? tool.server}</p>
      {meta?.availability === "setup" && <p className="mt-1 text-[10px] text-amber-300">Needs configuration</p>}
      {tool.approval && <p className="mt-1 text-[10px] text-zinc-400">Approval required</p>}
      <Handle id="tool" type="source" position={Position.Top} className="!h-2.5 !w-2.5 !border !border-black !bg-olive-bright" />
    </Frame>
  );
}

export function RouterNode({ id, data, selected }: NodeProps) {
  const router = data as RouterData;
  const runtime = useMesh((state) => state.runtime[id]);
  const handles = [...router.routes, { id: "else", label: router.fallback, match: "" }];
  return (
    <Frame kind="ROUTER" title={router.name || "Route"} status={runtime?.status} selected={selected}>
      <div className="mt-2 space-y-1">
        {handles.map((route) => (
          <div key={route.id} className="flex justify-between font-mono text-[10px] text-zinc-300">
            <span>{route.label}</span>
            <span>{route.match || "else"}</span>
          </div>
        ))}
      </div>
      <Handle id="flow-in" type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-lavender" />
      {handles.map((route, index) => (
        <Handle
          key={route.id}
          id={route.id}
          type="source"
          position={Position.Right}
          className="!h-2 !w-2 !border-0 !bg-lavender"
          style={{ top: `${((index + 1) / (handles.length + 1)) * 100}%` }}
        />
      ))}
    </Frame>
  );
}

export const nodeTypes = {
  agent: AgentNode,
  llm: LlmNode,
  tool: ToolNode,
  router: RouterNode,
};
