import type { ImportConversionResult, WorkflowPlatform } from "../../../shared/workflowImport";
import { convertFlowise, detectFlowise } from "./flowise";
import { convertLangflow, detectLangflow } from "./langflow";
import { convertN8n, detectN8n } from "./n8n";

export type ConverterId = "langflow" | "flowise" | "n8n";

const converters: { id: ConverterId; detect: (raw: unknown) => boolean; convert: (raw: unknown) => ImportConversionResult }[] = [
  { id: "langflow", detect: detectLangflow, convert: convertLangflow },
  { id: "flowise", detect: detectFlowise, convert: convertFlowise },
  { id: "n8n", detect: detectN8n, convert: convertN8n },
];

export function detectWorkflowSource(raw: unknown): WorkflowPlatform {
  for (const item of converters) {
    if (item.detect(raw)) return item.id;
  }
  return "unknown";
}

export function convertWorkflow(raw: unknown, source: "auto" | ConverterId = "auto"): ImportConversionResult {
  if (source !== "auto") {
    const pick = converters.find((c) => c.id === source);
    if (!pick) return { ok: false, error: `Unknown source ${source}`, name: "", summary: [], detectedSource: "unknown" };
    return pick.convert(raw);
  }
  for (const item of converters) {
    if (item.detect(raw)) return item.convert(raw);
  }
  return {
    ok: false,
    error: "Unrecognized workflow JSON. Supported: Langflow, Flowise, n8n exports.",
    name: "",
    summary: [],
    detectedSource: "unknown",
  };
}

export { convertLangflow, convertFlowise, convertN8n };
