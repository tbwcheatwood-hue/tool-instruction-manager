import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createNode, exampleGraph, type EngineEvent, type Hardware } from "../shared/mesh";
import { runMesh, type MeshDeps } from "./execute";
import { resolveInside } from "./sandbox";

const hardware: Hardware = {
  ramPercent: 10,
  ramUsedGb: 1,
  ramTotalGb: 8,
  vramUsedMb: 512,
  vramTotalMb: 8192,
  gpuPercent: 4,
};

function deps(partial: Partial<MeshDeps> & Pick<MeshDeps, "complete">): { events: EngineEvent[]; deps: MeshDeps } {
  const events: EngineEvent[] = [];
  return {
    events,
    deps: {
      flowId: "test",
      emit: (event) => events.push(event),
      invokeTool: async () => "f README.txt",
      waitHuman: async () => ({ decision: "note", text: "carry on" }),
      hardware: async () => hardware,
      recall: () => [],
      remember: () => {},
      signal: new AbortController().signal,
      ...partial,
    },
  };
}

test("intent router sends a writing plan to the writer only", async () => {
  const graph = exampleGraph();
  const brain = graph.nodes.find((node) => node.id === "llm-main");
  if (brain?.data.kind === "llm") brain.data.model = "local-test";
  const seen: string[] = [];
  const harness = deps({
    complete: async (_node, _llm, messages) => {
      const system = messages[0]?.content ?? "";
      if (system.includes("You are the planner")) {
        seen.push("planner");
        return { text: "I will write the deliverable.", toolCalls: [], tps: 30, ttftMs: 40 };
      }
      if (system.includes("You write the deliverable")) {
        seen.push("writer");
        return { text: "Draft ready.", toolCalls: [], tps: 28, ttftMs: 20 };
      }
      seen.push("critic");
      return { text: "Risk noted.", toolCalls: [], tps: 1, ttftMs: 1 };
    },
  });
  await runMesh(graph, "Prepare the notes", harness.deps);
  assert.deepEqual(seen, ["planner", "writer"]);
  assert.equal(harness.events.at(-1)?.kind, "run");
});

test("an agent follows a text tool call back into the model", async () => {
  const graph = exampleGraph();
  const brain = graph.nodes.find((node) => node.id === "llm-main");
  if (brain?.data.kind === "llm") brain.data.model = "local-test";
  graph.nodes = graph.nodes.filter((node) => node.id === "llm-main" || node.id === "agent-planner" || node.id === "tool-files");
  graph.edges = graph.edges.filter((edge) => edge.target === "agent-planner" || edge.source === "agent-planner");
  graph.edges = graph.edges.filter((edge) => edge.target !== "router-intent");
  let round = 0;
  let toolArgs = "";
  const harness = deps({
    invokeTool: async (_node, _tool, args) => {
      toolArgs = JSON.stringify(args);
      return "f README.txt";
    },
    complete: async () => {
      round += 1;
      if (round === 1) return { text: 'TOOL filesystem {"op":"list","path":"."}', toolCalls: [], tps: 10, ttftMs: 5 };
      return { text: "The workspace has a readme.", toolCalls: [], tps: 12, ttftMs: 6 };
    },
  });
  await runMesh(graph, "List files", harness.deps);
  assert.match(toolArgs, /list/);
  assert.equal(round, 2);
});

test("a cycle stops at the visit cap", async () => {
  const start = createNode("agent", { x: 0, y: 0 });
  const left = createNode("agent", { x: 200, y: 0 });
  const right = createNode("agent", { x: 400, y: 0 });
  let running = 0;
  const harness = deps({
    complete: async () => {
      throw new Error("no model in this test");
    },
  });
  harness.deps.emit = (event) => {
    harness.events.push(event);
    if (event.kind === "node" && event.status === "running") running += 1;
  };
  await runMesh(
    {
      nodes: [start, left, right],
      edges: [
        { id: "1", source: start.id, target: left.id, data: { relation: "flow" } },
        { id: "2", source: left.id, target: right.id, data: { relation: "flow" } },
        { id: "3", source: right.id, target: left.id, data: { relation: "flow" } },
      ],
    },
    "loop",
    harness.deps,
  );
  assert.ok(running <= 7);
  assert.equal(harness.events.at(-1)?.kind, "run");
});

test("workspace paths cannot escape the root", () => {
  const root = path.join("/tmp", "tim-workspace");
  assert.equal(resolveInside(root, "notes/a.txt"), path.join(root, "notes/a.txt"));
  assert.throws(() => resolveInside(root, "../secret"), /workspace/);
});
