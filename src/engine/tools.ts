import type { Artifact, WorkflowNode } from "../shared/types";
import { asText, lookup, renderTemplate, textOfOutput } from "./text";

export interface ToolInput {
  nodeId: string;
  label: string;
  output: unknown;
}

export interface ToolContext {
  node: WorkflowNode;
  inputs: ToolInput[];
  artifacts: Map<string, Artifact>;
}

function inputText(inputs: ToolInput[]): string {
  return inputs.map((item) => textOfOutput(item.output)).join("\n");
}

export async function runTool(context: ToolContext): Promise<{ output: unknown; artifactsWritten: Artifact[] }> {
  const { node, inputs, artifacts } = context;
  const config = node.config;
  const tool = String(config.tool ?? "echo");
  const text = inputText(inputs);
  const written: Artifact[] = [];

  switch (tool) {
    case "echo":
      return { output: { text, tool }, artifactsWritten: written };
    case "template": {
      const rendered = renderTemplate(String(config.contentTemplate ?? ""), text);
      return { output: { text: rendered, tool }, artifactsWritten: written };
    }
    case "json_extract": {
      const merged = { upstream: inputs, text };
      const value = lookup(merged, String(config.path ?? ""));
      return { output: { value, text: asText(value), tool }, artifactsWritten: written };
    }
    case "concat": {
      const separator = String(config.separator ?? "\n");
      const joined = inputs.map((item) => textOfOutput(item.output)).join(separator);
      return { output: { text: joined, tool }, artifactsWritten: written };
    }
    case "delay": {
      const ms = Math.max(0, Math.min(5000, Number(config.delayMs ?? 40)));
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { output: { text, note: String(config.note ?? node.id), tool }, artifactsWritten: written };
    }
    case "write_artifact": {
      const name = String(config.artifactName ?? "").trim();
      if (!name) throw new Error("write_artifact requires an artifact name");
      const content = renderTemplate(String(config.contentTemplate ?? "{{input}}"), text);
      const artifact: Artifact = { name, content, producedBy: node.id };
      artifacts.set(name, artifact);
      written.push(artifact);
      return { output: { text: content, artifact: name, tool }, artifactsWritten: written };
    }
    default:
      throw new Error(`Unknown tool "${tool}"`);
  }
}
