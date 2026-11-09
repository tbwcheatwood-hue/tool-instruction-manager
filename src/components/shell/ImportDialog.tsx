"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { engineFetch, type FlowRecord } from "@/lib/engine";
import type { ImportConversionResult, WorkflowSearchPlatform, WorkflowSearchResponse } from "../../../shared/workflowImport";
import { useMesh } from "@/store/mesh";

type Tab = "saved" | "file" | "discover";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function summaryTone(severity: string): string {
  if (severity === "ok") return "text-olive";
  if (severity === "warning") return "text-amber-300";
  return "text-lavender";
}

export function ImportDialog({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (flow: FlowRecord, summary?: ImportConversionResult) => void;
}) {
  const flows = useMesh((state) => state.flows);
  const flowId = useMesh((state) => state.flowId);
  const setFlows = useMesh((state) => state.setFlows);
  const setNotice = useMesh((state) => state.setNotice);
  const [tab, setTab] = useState<Tab>("saved");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(flowId);
  const [conversion, setConversion] = useState<ImportConversionResult | null>(null);
  const [platform, setPlatform] = useState<WorkflowSearchPlatform>("langflow");
  const [searchQuery, setSearchQuery] = useState("RAG");
  const [search, setSearch] = useState<WorkflowSearchResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(flowId);
    setError("");
    setConversion(null);
    setSearch(null);
    if (tab !== "saved") return;
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
  }, [flowId, open, setFlows, tab]);

  if (!open) return null;

  const loadConversion = (result: ImportConversionResult) => {
    if (!result.ok || !result.graph) {
      setError(result.error || "Conversion failed.");
      setConversion(result);
      return;
    }
    setConversion(result);
    setError("");
  };

  const applyConversion = () => {
    if (!conversion?.ok || !conversion.graph) return;
    onImport(
      {
        id: crypto.randomUUID(),
        name: conversion.name,
        graph: conversion.graph,
        updatedAt: new Date().toISOString(),
      },
      conversion,
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="import-title" data-testid="import-dialog">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col border border-lavender/40 bg-zinc-950 shadow-glow">
        <header className="border-b border-lavender/25 px-4 py-3">
          <h2 id="import-title" className="font-mono text-[11px] tracking-[0.16em] text-lavender-bright">
            IMPORT WORKFLOW
          </h2>
          <div className="mt-2 flex gap-1">
            {(
              [
                ["saved", "Saved"],
                ["file", "File"],
                ["discover", "Discover"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`px-2 py-1 font-mono text-[10px] ${tab === id ? "bg-lavender/20 text-lavender-bright" : "text-zinc-500 hover:text-zinc-300"}`}
                onClick={() => {
                  setTab(id);
                  setError("");
                }}
                data-testid={`import-tab-${id}`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {tab === "saved" && (
            <>
              {loading && <p className="text-sm text-zinc-400">Loading saved flows…</p>}
              {error && <p className="text-sm text-lavender">{error}</p>}
              {!loading && flows.length === 0 && <p className="text-sm text-zinc-400">No saved flows yet.</p>}
              {!loading &&
                flows.map((flow) => (
                  <button
                    key={flow.id}
                    type="button"
                    onClick={() => setSelected(flow.id)}
                    className={`block w-full border px-3 py-2 text-left ${selected === flow.id ? "border-lavender bg-black" : "border-lavender/25 hover:border-lavender/50"}`}
                  >
                    <div className="font-medium">{flow.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{formatWhen(flow.updatedAt)}</div>
                  </button>
                ))}
            </>
          )}

          {tab === "file" && (
            <>
              <p className="text-[11px] leading-relaxed text-zinc-400">
                Upload a JSON export from Langflow, Flowise, or n8n. Credentials are not imported; review the summary before loading.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="block w-full text-[11px] text-zinc-300"
                data-testid="workflow-file"
                onChange={() => {
                  setConversion(null);
                  setError("");
                }}
              />
              <Button
                variant="outline"
                className="w-full"
                data-testid="workflow-parse-file"
                onClick={() => {
                  const file = fileRef.current?.files?.[0];
                  if (!file) {
                    setError("Choose a .json file first.");
                    return;
                  }
                  if (file.size > 2_000_000) {
                    setError("File exceeds 2 MB limit.");
                    return;
                  }
                  setLoading(true);
                  void file
                    .text()
                    .then((text) => engineFetch<ImportConversionResult>("/workflows/import", { method: "POST", body: JSON.stringify({ text }) }))
                    .then(loadConversion)
                    .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
                    .finally(() => setLoading(false));
                }}
              >
                {loading ? <Loader2 className="animate-spin" size={14} /> : null}
                Validate &amp; convert
              </Button>
            </>
          )}

          {tab === "discover" && (
            <>
              <p className="text-[11px] leading-relaxed text-zinc-400">
                Searches allowlisted public GitHub repos (not live Langflow/Flowise/n8n cloud catalogs). See docs/WORKFLOW-IMPORT.md.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["langflow", "flowise", "n8n"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`border px-2 py-1 font-mono text-[10px] ${platform === p ? "border-lavender text-lavender-bright" : "border-lavender/25 text-zinc-500"}`}
                    onClick={() => setPlatform(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search terms (e.g. RAG, chatbot)" className="font-mono text-xs" />
              <Button
                variant="outline"
                className="w-full"
                data-testid="workflow-search"
                onClick={() => {
                  setLoading(true);
                  setSearch(null);
                  void engineFetch<WorkflowSearchResponse>("/workflows/search", {
                    method: "POST",
                    body: JSON.stringify({ platform, query: searchQuery }),
                  })
                    .then(setSearch)
                    .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
                    .finally(() => setLoading(false));
                }}
              >
                Search GitHub
              </Button>
              {search?.providerNote && <p className="font-mono text-[10px] text-zinc-500">{search.providerNote}</p>}
              {search?.incomplete && <p className="text-[11px] text-amber-300">{search.incomplete}</p>}
              <div className="space-y-1">
                {search?.results.map((hit) => (
                  <div key={`${hit.repository}:${hit.path}`} className="border border-lavender/20 p-2">
                    <div className="text-[11px] text-zinc-100">
                      {hit.name} <span className="text-zinc-500">· {hit.platform}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[9px] text-zinc-500">{hit.description}</div>
                    <div className="mt-2 flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(hit.htmlUrl, "_blank", "noopener,noreferrer")}
                      >
                        GitHub
                      </Button>
                      <Button
                        size="sm"
                        data-testid={`import-hit-${hit.name}`}
                        onClick={() => {
                          setLoading(true);
                          void engineFetch<ImportConversionResult>("/workflows/fetch", {
                            method: "POST",
                            body: JSON.stringify({ rawUrl: hit.rawUrl }),
                          })
                            .then((result) => {
                              loadConversion(result);
                              setTab("file");
                            })
                            .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : String(cause)))
                            .finally(() => setLoading(false));
                        }}
                      >
                        Import
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {error && <p className="text-sm text-lavender">{error}</p>}

          {conversion && (
            <div className="border border-lavender/25 p-2" data-testid="conversion-summary">
              <div className="font-mono text-[10px] text-lavender-bright">
                {conversion.ok ? "Conversion preview" : "Conversion failed"} · {conversion.detectedSource}
              </div>
              {conversion.ok && conversion.graph && (
                <p className="mt-1 text-[10px] text-zinc-400">
                  {conversion.graph.nodes.length} nodes, {conversion.graph.edges.length} edges — not semantically equivalent to the source.
                </p>
              )}
              <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto font-mono text-[9px]">
                {conversion.summary.map((line, index) => (
                  <li key={`${line.message}-${index}`} className={summaryTone(line.severity)}>
                    [{line.severity}] {line.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-lavender/25 px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {tab === "saved" && (
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
          )}
          {(tab === "file" || (tab === "discover" && conversion?.ok)) && (
            <Button disabled={!conversion?.ok} data-testid="confirm-external-import" onClick={applyConversion}>
              Load on canvas
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
