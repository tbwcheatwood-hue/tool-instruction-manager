import type { ConversionLine } from "../../../shared/workflowImport";
import { redactSecret } from "../../../shared/workflowImport";

const SECRET_KEYS = /api[_-]?key|password|secret|token|credential|openai_api_key|anthropic_api_key/i;

export function pushSecretWarnings(obj: unknown, prefix: string, summary: ConversionLine[]): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => pushSecretWarnings(item, `${prefix}[${i}]`, summary));
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SECRET_KEYS.test(key)) {
      const plain = typeof value === "string" ? value : (value as { value?: unknown })?.value;
      if (typeof plain === "string" && plain.trim()) {
        summary.push({
          severity: "warning",
          message: `Credential field "${key}" was not imported (${redactSecret(plain)}). Set keys locally in T.I.M. or ALS.`,
          sourceRef: prefix,
        });
      }
    }
    if (value && typeof value === "object") {
      pushSecretWarnings(value, `${prefix}.${key}`, summary);
    }
  }
}

export function componentLabel(node: Record<string, unknown>): string {
  const data = node.data as Record<string, unknown> | undefined;
  const display =
    (data?.display_name as string) ||
    (data?.type as string) ||
    (node.type as string) ||
    (node.id as string);
  return String(display);
}

export function nodeTypeName(node: Record<string, unknown>): string {
  const data = node.data as Record<string, unknown> | undefined;
  const fromData = data?.type ?? data?.name;
  if (fromData) return String(fromData);
  const top = node.type;
  if (typeof top === "string" && top !== "genericNode" && top !== "default") return top;
  const id = String(node.id ?? "");
  const head = id.split("-")[0];
  return head || "Unknown";
}
