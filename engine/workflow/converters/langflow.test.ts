import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { convertLangflow, detectLangflow } from "./langflow";
import { parseWorkflowText } from "../parse";
import { detectWorkflowSource } from "./index";

const fixture = path.join(import.meta.dirname, "fixtures", "langflow-minimal.json");

test("detectLangflow recognizes starter-shaped export", () => {
  const raw = JSON.parse(readFileSync(fixture, "utf8")) as unknown;
  assert.equal(detectLangflow(raw), true);
  assert.equal(detectWorkflowSource(raw), "langflow");
});

test("convertLangflow maps nodes and flow edges", () => {
  const raw = JSON.parse(readFileSync(fixture, "utf8")) as unknown;
  const result = convertLangflow(raw);
  assert.equal(result.ok, true);
  assert.ok(result.graph);
  assert.equal(result.graph!.nodes.length, 3);
  assert.equal(result.graph!.edges.length, 2);
  assert.ok(result.summary.some((line) => line.severity === "warning"));
  assert.equal(result.graph!.meta?.source, "langflow");
});

test("parseWorkflowText rejects invalid JSON", () => {
  const bad = parseWorkflowText("{not json");
  assert.equal(bad.ok, false);
  assert.match(bad.error ?? "", /Invalid JSON/);
});

test("parseWorkflowText redacts secrets in summary only", () => {
  const raw = JSON.parse(readFileSync(fixture, "utf8")) as Record<string, unknown>;
  const data = raw.data as Record<string, unknown>;
  const nodes = data.nodes as Record<string, unknown>[];
  const model = nodes[1] as Record<string, unknown>;
  const node = model.data as Record<string, unknown>;
  const inner = node.node as Record<string, unknown>;
  inner.template = {
    openai_api_key: { value: "sk-test-secret-value" },
  };
  const result = parseWorkflowText(JSON.stringify(raw));
  assert.ok(result.summary.some((line) => /Credential field/i.test(line.message)));
  assert.ok(!JSON.stringify(result.graph).includes("sk-test-secret"));
});
