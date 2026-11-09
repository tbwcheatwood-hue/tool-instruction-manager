import assert from "node:assert/strict";
import test from "node:test";
import { chooseRoute, entryNodes, exampleGraph, parseToolCall, relationOf } from "./mesh";

test("example mesh starts at the planner", () => {
  const graph = exampleGraph();
  const starts = entryNodes(graph).map((node) => node.id);
  assert.deepEqual(starts, ["agent-planner"]);
  assert.equal(relationOf(graph.edges[0]), "brain");
});

test("router prefers the first matching handle", () => {
  const chosen = chooseRoute(
    [
      { id: "write", label: "Write", match: "write" },
      { id: "review", label: "Review", match: "review" },
    ],
    "Continue",
    "Please write the note",
  );
  assert.deepEqual(chosen, { handle: "write", label: "Write" });
  assert.equal(chooseRoute([{ id: "write", label: "Write", match: "write" }], "Review", "just thinking").handle, "else");
});

test("tool call parser reads a single JSON payload", () => {
  const call = parseToolCall('I need files.\nTOOL filesystem {"op":"list","path":"."}\nThanks');
  assert.deepEqual(call, { name: "filesystem", args: { op: "list", path: "." } });
  assert.equal(parseToolCall("no tool here"), null);
});
