"use client";

import { Search } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { Input } from "@/components/ui/input";
import { PALETTE_GROUPS, PALETTE_ITEMS, type PaletteGroupId } from "@/lib/palette";
import type { NodeKind, ToolServer } from "../../../shared/mesh";
import { useMesh } from "@/store/mesh";

export function Palette() {
  const addNode = useMesh((state) => state.addNode);
  const addToolNode = useMesh((state) => state.addToolNode);
  const openPanel = useMesh((state) => state.openPanel);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const groups = useMemo(() => {
    return PALETTE_GROUPS.map((group) => ({
      ...group,
      items: PALETTE_ITEMS.filter((item) => {
        if (item.group !== group.id) return false;
        if (!needle) return true;
        return `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(needle);
      }),
    })).filter((group) => group.items.length > 0);
  }, [needle]);

  const startDrag = (event: DragEvent, payload: string) => {
    event.dataTransfer.setData("application/tim", payload);
    event.dataTransfer.effectAllowed = "move";
  };

  const place = (kind: NodeKind | ToolServer, isTool: boolean) => {
    if (isTool) addToolNode(kind as ToolServer);
    else addNode(kind as NodeKind);
    openPanel("node");
  };

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-lavender/35 bg-zinc-950/95 md:w-[236px]" data-testid="palette">
      <div className="border-b border-lavender/25 px-3 py-3">
        <div className="font-mono text-[10px] tracking-[0.18em] text-lavender-bright">COMPONENTS</div>
        <div className="relative mt-2">
          <Search size={13} className="pointer-events-none absolute left-2 top-2.5 text-zinc-400" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search nodes and tools"
            aria-label="Search components"
            className="h-8 border-lavender/30 bg-black pl-7 text-xs text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-2">
        {groups.length === 0 && <p className="px-2 py-4 text-xs text-zinc-400">No components match that search.</p>}
        {groups.map((group) => (
          <section key={group.id}>
            <h3 className="px-2 py-1 font-mono text-[10px] tracking-[0.16em] text-zinc-400">{group.label.toUpperCase()}</h3>
            <div className="space-y-1">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  draggable
                  data-testid={`palette-${item.id}`}
                  onDragStart={(event) => startDrag(event, item.kind === "tool" ? `tool:${item.server}` : item.nodeKind)}
                  onClick={() => place(item.kind === "tool" ? item.server : item.nodeKind, item.kind === "tool")}
                  className="group flex w-full items-start gap-2 border border-transparent px-2 py-2 text-left transition hover:border-lavender/45 hover:bg-black focus-visible:border-lavender focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lavender"
                >
                  <item.icon size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-lavender" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-100 group-hover:text-lavender-bright">
                      {item.label}
                      {item.kind === "tool" && item.availability === "setup" && (
                        <span className="rounded-sm border border-amber-500/50 px-1 font-mono text-[9px] uppercase tracking-wide text-amber-300">Setup</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-zinc-400">{item.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="border-t border-lavender/20 px-3 py-3 font-mono text-[10px] leading-relaxed text-zinc-500">
        Drag onto the canvas or click to add. Brain on top, tools below, flow left to right.
      </div>
    </aside>
  );
}
