"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { engineFetch, type FlowRecord } from "@/lib/engine";
import { useMesh } from "@/store/mesh";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function ImportDialog({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (flow: FlowRecord) => void;
}) {
  const flows = useMesh((state) => state.flows);
  const flowId = useMesh((state) => state.flowId);
  const setFlows = useMesh((state) => state.setFlows);
  const setNotice = useMesh((state) => state.setNotice);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(flowId);

  useEffect(() => {
    if (!open) return;
    setSelected(flowId);
    setError("");
    setLoading(true);
    void engineFetch<{ id: string; name: string; updatedAt: string }[]>("/flows")
      .then((list) => {
        setFlows(list);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      });
  }, [flowId, open, setFlows]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="import-title" data-testid="import-dialog">
      <div className="w-full max-w-lg border border-lavender/40 bg-zinc-950 shadow-glow">
        <header className="flex items-center justify-between border-b border-lavender/25 px-4 py-3">
          <h2 id="import-title" className="font-mono text-[11px] tracking-[0.16em] text-lavender-bright">
            IMPORT FLOW
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-lavender focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lavender" aria-label="Close import dialog">
            ×
          </button>
        </header>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto px-4 py-3">
          {loading && <p className="text-sm text-zinc-400">Loading saved flows…</p>}
          {error && <p className="text-sm text-lavender">{error}</p>}
          {!loading && !error && flows.length === 0 && (
            <p className="text-sm text-zinc-400">No saved flows yet. Save this mesh first, then import it here.</p>
          )}
          {!loading &&
            !error &&
            flows.map((flow) => (
              <button
                key={flow.id}
                type="button"
                onClick={() => setSelected(flow.id)}
                className={`block w-full border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lavender ${
                  selected === flow.id ? "border-lavender bg-black text-zinc-100" : "border-lavender/25 text-zinc-300 hover:border-lavender/50"
                }`}
              >
                <div className="font-medium">{flow.name}</div>
                <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{formatWhen(flow.updatedAt)}</div>
              </button>
            ))}
        </div>
        <footer className="flex justify-end gap-2 border-t border-lavender/25 px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selected || loading || Boolean(error)}
            data-testid="confirm-import"
            onClick={() => {
              if (!selected) return;
              void engineFetch<FlowRecord>(`/flows/${selected}`)
                .then((flow) => {
                  onImport(flow);
                  onClose();
                })
                .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : String(cause)));
            }}
          >
            Import
          </Button>
        </footer>
      </div>
    </div>
  );
}
