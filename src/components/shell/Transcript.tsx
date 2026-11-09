"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMesh } from "@/store/mesh";

export function Transcript() {
  const log = useMesh((state) => state.log);
  const open = useMesh((state) => state.transcriptOpen);
  const setOpen = useMesh((state) => state.setTranscriptOpen);
  return (
    <section className="shrink-0 border-t border-lavender/15 bg-black">
      <button type="button" className="flex h-8 w-full items-center justify-between px-4 font-mono text-[10px] tracking-[0.16em] text-zinc-500" onClick={() => setOpen(!open)}>
        RUN LOG
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        <div className="max-h-40 space-y-1 overflow-y-auto px-4 pb-3 font-mono text-[11px] leading-relaxed" data-testid="run-log">
          {log.length === 0 && <p className="text-zinc-600">Waiting.</p>}
          {log.map((entry) => (
            <p key={entry.id} className={entry.tone === "tool" ? "text-olive" : entry.tone === "error" ? "text-lavender" : "text-zinc-400"}>
              {entry.text}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
