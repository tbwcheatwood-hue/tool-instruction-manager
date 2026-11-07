export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function lookup(value: unknown, path: string): unknown {
  if (!path) return value;
  let current = value;
  for (const part of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function textOfOutput(output: unknown): string {
  if (output && typeof output === "object" && "text" in output && typeof (output as { text: unknown }).text === "string") {
    return (output as { text: string }).text;
  }
  return asText(output);
}

export function renderTemplate(template: string, inputText: string): string {
  return template.replaceAll("{{input}}", inputText).replaceAll("{{text}}", inputText);
}

export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}
