"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMesh } from "@/store/mesh";

function formatBytes(size: number | null): string {
  if (!size) return "";
  if (size > 1_000_000_000) return `${(size / 1_000_000_000).toFixed(1)} GB`;
  return `${Math.round(size / 1_000_000)} MB`;
}

export function ModelHub() {
  const models = useMesh((state) => state.models);
  const online = useMesh((state) => state.modelsOnline);
  const error = useMesh((state) => state.modelsError);
  const settings = useMesh((state) => state.settings);
  const saveSettings = useMesh((state) => state.saveSettings);
  const refreshModels = useMesh((state) => state.refreshModels);
  const updateNode = useMesh((state) => state.updateNode);
  const nodes = useMesh((state) => state.nodes);
  const loadModel = useMesh((state) => state.loadModel);
  const setPanelOpen = useMesh((state) => state.setPanelOpen);
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);

  const target = nodes.find((node) => node.selected && node.data.kind === "llm") ?? nodes.find((node) => node.data.kind === "llm");

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-lavender/15 bg-black/80 backdrop-blur-md" data-testid="model-hub">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="font-mono text-[10px] tracking-[0.18em] text-lavender">MODELS</span>
        <button type="button" aria-label="Close models" onClick={() => setPanelOpen(false)} className="text-zinc-500 hover:text-lavender">
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <p className={`font-mono text-[10px] ${online ? "text-olive" : "text-zinc-500"}`}>{online ? "LM Studio is answering" : error || "LM Studio is not answering"}</p>
        <div className="space-y-2">
          {models.length === 0 && <p className="text-xs text-zinc-500">No models returned. Point a directory at your .gguf files or start LM Studio.</p>}
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => target && updateNode(target.id, { model: model.id })}
              className="block w-full border border-white/10 px-2 py-2 text-left hover:border-lavender/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-zinc-100">{model.label}</span>
                <span className={`font-mono text-[10px] ${model.loaded ? "text-olive" : "text-zinc-600"}`}>{model.loaded ? "LOADED" : model.source.toUpperCase()}</span>
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-zinc-500">
                {[model.params, model.quant, model.format, formatBytes(model.sizeBytes)].filter(Boolean).join(" · ")}
              </div>
            </button>
          ))}
        </div>
        {target && (
          <Button variant="outline" onClick={() => void loadModel(target.id)}>
            Load into selected LLM
          </Button>
        )}
        <form
          className="space-y-3 border-t border-white/5 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void saveSettings(draft).then(() => refreshModels());
          }}
        >
          <label className="block space-y-2">
            <Label>LM Studio URL</Label>
            <Input value={draft.lmStudioUrl} onChange={(event) => setDraft({ ...draft, lmStudioUrl: event.target.value })} className="font-mono text-xs" />
          </label>
          <label className="block space-y-2">
            <Label>GGUF directory</Label>
            <Input value={draft.modelsDir} onChange={(event) => setDraft({ ...draft, modelsDir: event.target.value })} className="font-mono text-xs" placeholder="/path/to/models" />
          </label>
          <label className="block space-y-2">
            <Label>Tool workspace</Label>
            <Input value={draft.workspaceDir} onChange={(event) => setDraft({ ...draft, workspaceDir: event.target.value })} className="font-mono text-xs" />
          </label>
          <label className="block space-y-2">
            <Label>MCP bridge URL</Label>
            <Input
              value={draft.mcpBridgeUrl}
              onChange={(event) => setDraft({ ...draft, mcpBridgeUrl: event.target.value })}
              className="font-mono text-xs"
              placeholder="http://127.0.0.1:8765/mcp"
            />
          </label>
          <p className="text-xs leading-relaxed text-zinc-500">Required for the MCP bridge tool node. The bridge must accept POST JSON with tool and arguments.</p>
          <Button type="submit" variant="olive">
            Apply
          </Button>
        </form>
      </div>
    </aside>
  );
}
