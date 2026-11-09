"use client";

import { X } from "lucide-react";
import { TOOL_CATALOG, toolPreset, type AgentData, type LlmData, type NodeData, type RouterData, type ToolData, type ToolCategory } from "../../../shared/mesh";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useMesh } from "@/store/mesh";

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between">
        <Label>{label}</Label>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-20 bg-transparent text-right font-mono text-[11px] text-olive outline-none"
        />
      </span>
      <Slider value={value} min={min} max={max} step={step} onValueChange={onChange} />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-zinc-300">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-olive" />
    </label>
  );
}

export function Inspector() {
  const nodes = useMesh((state) => state.nodes);
  const edges = useMesh((state) => state.edges);
  const updateNode = useMesh((state) => state.updateNode);
  const updateEdgeRelation = useMesh((state) => state.updateEdgeRelation);
  const setPanelOpen = useMesh((state) => state.setPanelOpen);
  const loadModel = useMesh((state) => state.loadModel);
  const unloadModel = useMesh((state) => state.unloadModel);
  const models = useMesh((state) => state.models);
  const node = nodes.find((item) => item.selected);
  const edge = edges.find((item) => item.selected);

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-lavender/35 bg-zinc-950/95 backdrop-blur-md" data-testid="inspector">
      <div className="flex items-center justify-between border-b border-lavender/25 px-3 py-2">
        <span className="font-mono text-[10px] tracking-[0.18em] text-lavender-bright">INSPECTOR</span>
        <button type="button" aria-label="Close inspector" onClick={() => setPanelOpen(false)} className="text-zinc-500 hover:text-lavender">
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {!node && !edge && <p className="text-xs text-zinc-400">Select a node or an edge.</p>}
        {node?.data.kind === "agent" && <AgentFields data={node.data} onChange={(patch) => updateNode(node.id, patch)} />}
        {node?.data.kind === "llm" && (
          <LlmFields
            data={node.data}
            models={models.map((model) => model.id)}
            onChange={(patch) => updateNode(node.id, patch)}
            onLoad={() => void loadModel(node.id)}
            onUnload={() => void unloadModel(node.id)}
          />
        )}
        {node?.data.kind === "tool" && <ToolFields data={node.data} onChange={(patch) => updateNode(node.id, patch)} />}
        {node?.data.kind === "router" && <RouterFields data={node.data} onChange={(patch) => updateNode(node.id, patch)} />}
        {!node && edge && (
          <label className="block space-y-2">
            <Label>Edge</Label>
            <select
              value={edge.data?.relation ?? "flow"}
              onChange={(event) => updateEdgeRelation(edge.id, event.target.value as "flow" | "brain" | "tool")}
              className="h-8 w-full border border-white/10 bg-black px-2 text-sm"
            >
              <option value="flow">Flow</option>
              <option value="brain">Brain</option>
              <option value="tool">Tool</option>
            </select>
          </label>
        )}
      </div>
    </aside>
  );
}

function AgentFields({ data, onChange }: { data: AgentData; onChange: (patch: Partial<NodeData>) => void }) {
  return (
    <>
      <label className="block space-y-2">
        <Label>Name</Label>
        <Input value={data.name} onChange={(event) => onChange({ name: event.target.value })} />
      </label>
      <label className="block space-y-2">
        <Label>Role</Label>
        <Input value={data.role} onChange={(event) => onChange({ role: event.target.value })} />
      </label>
      <label className="block space-y-2">
        <Label>System prompt</Label>
        <textarea
          value={data.systemPrompt}
          onChange={(event) => onChange({ systemPrompt: event.target.value })}
          className="min-h-32 w-full border border-white/10 bg-black p-2 font-mono text-xs leading-relaxed outline-none focus:border-lavender"
        />
      </label>
      <Check label="Broadcast to neighboring agents" checked={data.broadcast} onChange={(broadcast) => onChange({ broadcast })} />
      <Check label="Pause for a human note" checked={data.humanGate} onChange={(humanGate) => onChange({ humanGate })} />
      <Check label="Remember in SQLite" checked={data.remember} onChange={(remember) => onChange({ remember })} />
    </>
  );
}

function LlmFields({
  data,
  models,
  onChange,
  onLoad,
  onUnload,
}: {
  data: LlmData;
  models: string[];
  onChange: (patch: Partial<NodeData>) => void;
  onLoad: () => void;
  onUnload: () => void;
}) {
  return (
    <>
      <label className="block space-y-2">
        <Label>Model</Label>
        <Input list="tim-models" value={data.model} onChange={(event) => onChange({ model: event.target.value })} placeholder="publisher/model" className="font-mono text-xs" />
        <datalist id="tim-models">
          {models.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
      </label>
      <RangeField label="GPU offload layers %" value={data.gpuLayers} min={0} max={100} step={1} onChange={(gpuLayers) => onChange({ gpuLayers })} />
      <p className="font-mono text-[10px] leading-relaxed text-zinc-600">Sent as lms --gpu when the CLI is installed. The REST loader uses this as KV-cache GPU offload on or off.</p>
      <RangeField label="Context n_ctx" value={data.nCtx} min={1024} max={32768} step={256} onChange={(nCtx) => onChange({ nCtx })} />
      <RangeField label="CPU threads" value={data.threads} min={1} max={64} step={1} onChange={(threads) => onChange({ threads })} />
      <RangeField label="Temperature" value={data.temperature} min={0} max={2} step={0.05} onChange={(temperature) => onChange({ temperature })} />
      <RangeField label="Top K" value={data.topK} min={1} max={200} step={1} onChange={(topK) => onChange({ topK })} />
      <RangeField label="Top P" value={data.topP} min={0} max={1} step={0.01} onChange={(topP) => onChange({ topP })} />
      <RangeField label="Repeat penalty" value={data.repeatPenalty} min={0.8} max={2} step={0.01} onChange={(repeatPenalty) => onChange({ repeatPenalty })} />
      <div className="flex gap-2">
        <button type="button" onClick={onLoad} className="h-8 flex-1 border border-lavender text-[10px] tracking-[0.14em] text-lavender">
          LOAD
        </button>
        <button type="button" onClick={onUnload} className="h-8 flex-1 border border-white/15 text-[10px] tracking-[0.14em] text-zinc-400">
          UNLOAD
        </button>
      </div>
    </>
  );
}

const TOOL_GROUP_LABEL: Record<ToolCategory, string> = {
  workspace: "Workspace",
  runtime: "Runtime",
  data: "Data",
  network: "Network",
  mcp: "MCP",
};

function ToolFields({ data, onChange }: { data: ToolData; onChange: (patch: Partial<NodeData>) => void }) {
  const active = toolPreset(data.server);
  const groups = ["workspace", "runtime", "data", "network", "mcp"] as ToolCategory[];
  return (
    <>
      <label className="block space-y-2">
        <Label>Tool</Label>
        <select
          value={data.server}
          onChange={(event) => {
            const server = event.target.value as ToolData["server"];
            const preset = toolPreset(server);
            onChange({ server, label: preset?.label ?? data.label, approval: preset?.approval ?? data.approval });
          }}
          className="h-8 w-full border border-lavender/30 bg-black px-2 text-sm text-zinc-100 focus:border-lavender focus:outline-none focus:ring-1 focus:ring-lavender"
        >
          {groups.map((group) => (
            <optgroup key={group} label={TOOL_GROUP_LABEL[group]}>
              {TOOL_CATALOG.filter((item) => item.category === group).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                  {item.availability === "setup" ? " (setup)" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="block space-y-2">
        <Label>Label</Label>
        <Input value={data.label} onChange={(event) => onChange({ label: event.target.value })} />
      </label>
      <Check label="Require approval" checked={data.approval} onChange={(approval) => onChange({ approval })} />
      {active?.availability === "setup" && (
        <p className="rounded-sm border border-amber-500/40 bg-amber-950/30 px-2 py-2 text-xs text-amber-200">{active.setupNote ?? "This tool needs configuration before it will work."}</p>
      )}
      {active?.hint && <p className="text-xs leading-relaxed text-zinc-400">{active.hint}</p>}
    </>
  );
}

function RouterFields({ data, onChange }: { data: RouterData; onChange: (patch: Partial<NodeData>) => void }) {
  return (
    <>
      <label className="block space-y-2">
        <Label>Name</Label>
        <Input value={data.name} onChange={(event) => onChange({ name: event.target.value })} />
      </label>
      <label className="block space-y-2">
        <Label>Fallback</Label>
        <Input value={data.fallback} onChange={(event) => onChange({ fallback: event.target.value })} />
      </label>
      <div className="space-y-2">
        <Label>Routes</Label>
        {data.routes.map((route, index) => (
          <div key={route.id} className="grid grid-cols-[1fr_1fr_auto] gap-1">
            <Input
              value={route.label}
              aria-label="Route label"
              onChange={(event) => {
                const routes = data.routes.slice();
                routes[index] = { ...route, label: event.target.value };
                onChange({ routes });
              }}
            />
            <Input
              value={route.match}
              aria-label="Route match"
              onChange={(event) => {
                const routes = data.routes.slice();
                routes[index] = { ...route, match: event.target.value };
                onChange({ routes });
              }}
            />
            <button
              type="button"
              className="px-2 text-zinc-500 hover:text-lavender"
              onClick={() => onChange({ routes: data.routes.filter((item) => item.id !== route.id) })}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="font-mono text-[10px] tracking-[0.14em] text-lavender"
          onClick={() => onChange({ routes: [...data.routes, { id: `r-${crypto.randomUUID().slice(0, 4)}`, label: "Match", match: "" }] })}
        >
          ADD ROUTE
        </button>
      </div>
    </>
  );
}
