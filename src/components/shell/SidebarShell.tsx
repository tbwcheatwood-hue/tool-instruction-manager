"use client";

import { Cable, Shapes } from "lucide-react";
import { ConnectionsPanel } from "@/components/shell/ConnectionsPanel";
import { Palette } from "@/components/shell/Palette";
import { useMesh } from "@/store/mesh";

export function SidebarShell() {
  const leftRail = useMesh((state) => state.leftRail);
  const setLeftRail = useMesh((state) => state.setLeftRail);
  return (
    <div className="flex shrink-0 flex-col border-r border-lavender/35 bg-zinc-950/95" data-testid="sidebar-shell">
      <div className="flex border-b border-lavender/25">
        <button
          type="button"
          onClick={() => setLeftRail("components")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 font-mono text-[10px] tracking-[0.14em] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lavender ${
            leftRail === "components" ? "bg-black text-lavender-bright" : "text-zinc-400 hover:text-lavender"
          }`}
        >
          <Shapes size={13} /> COMPONENTS
        </button>
        <button
          type="button"
          onClick={() => setLeftRail("connections")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 font-mono text-[10px] tracking-[0.14em] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lavender ${
            leftRail === "connections" ? "bg-black text-lavender-bright" : "text-zinc-400 hover:text-lavender"
          }`}
        >
          <Cable size={13} /> CONNECT
        </button>
      </div>
      {leftRail === "connections" ? <ConnectionsPanel /> : <Palette />}
    </div>
  );
}
