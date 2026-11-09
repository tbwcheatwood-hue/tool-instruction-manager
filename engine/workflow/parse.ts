import type { ImportConversionResult } from "../../shared/workflowImport";
import { convertWorkflow, type ConverterId } from "./converters";

const MAX_BYTES = 2_000_000;

export function parseWorkflowText(text: string, source: "auto" | ConverterId = "auto"): ImportConversionResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Empty file.", name: "", summary: [], detectedSource: "unknown" };
  }
  if (Buffer.byteLength(trimmed, "utf8") > MAX_BYTES) {
    return { ok: false, error: "File exceeds 2 MB limit.", name: "", summary: [], detectedSource: "unknown" };
  }
  let json: unknown;
  try {
    json = JSON.parse(trimmed) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON — export a .json flow file from Langflow, Flowise, or n8n.", name: "", summary: [], detectedSource: "unknown" };
  }
  if (!json || typeof json !== "object") {
    return { ok: false, error: "JSON root must be an object.", name: "", summary: [], detectedSource: "unknown" };
  }
  return convertWorkflow(json, source);
}
