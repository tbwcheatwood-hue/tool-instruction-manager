"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AlsBridgeResult } from "../../../shared/alsRouting";

function summaryTone(severity: string): string {
  if (severity === "ok") return "text-olive";
  if (severity === "warning") return "text-amber-300";
  return "text-lavender";
}

export function ExportAlsDialog({
  open,
  loading,
  result,
  error,
  onClose,
  onPush,
}: {
  open: boolean;
  loading: boolean;
  result: AlsBridgeResult | null;
  error: string;
  onClose: () => void;
  onPush: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col border border-lavender/40 bg-zinc-950 shadow-glow">
        <header className="border-b border-lavender/25 px-4 py-3">
          <h2 className="font-mono text-[11px] tracking-[0.16em] text-lavender-bright">EXPORT TO ALS ROUTING CHART</h2>
        </header>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 text-[11px] text-zinc-300">
          {loading && (
            <p className="flex items-center gap-2 text-zinc-400">
              <Loader2 className="animate-spin" size={14} /> Converting mesh…
            </p>
          )}
          {error && <p className="text-lavender">{error}</p>}
          {result && (
            <>
              <p className="font-mono text-lavender-bright">
                {result.ok ? "Preview" : "Failed"} — {result.name}
              </p>
              {result.pipeline && (
                <p className="text-zinc-500">
                  {result.pipeline.nodes.length} chart nodes · {result.pipeline.edges.length} edges
                </p>
              )}
              {result.agentsTouched && (
                <p className="text-zinc-500">
                  Agents: {result.agentsTouched.created.length} created, {result.agentsTouched.matched.length} matched
                </p>
              )}
              <ul className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-[9px]">
                {result.summary.map((line, index) => (
                  <li key={`${line.message}-${index}`} className={summaryTone(line.severity)}>
                    [{line.severity}] {line.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-lavender/25 px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button disabled={loading || !result?.ok} data-testid="confirm-export-als" onClick={onPush}>
            Push to ALS
          </Button>
        </footer>
      </div>
    </div>
  );
}
