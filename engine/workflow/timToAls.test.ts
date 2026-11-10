import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createNode, type Graph } from "../../shared/mesh";
import { collectAgentDrafts, convertTimGraphToAls } from "./timToAls";

function link(
  source: string,
  target: string,
  relation: "flow" | "brain" = "flow",
): Graph["edges"][number] {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: "mesh",
    data: { relation },
    sourceHandle: relation,
    targetHandle: relation,
  };
}

describe("timToAls", () => {
  test("linear agent chain exports serial edges", () => {
    const a = createNode("agent", { x: 0, y: 0 });
    const b = createNode("agent", { x: 200, y: 0 });
    if (a.data.kind === "agent") a.data.name = "Alpha";
    if (b.data.kind === "agent") b.data.name = "Beta";
    const graph: Graph = { nodes: [a, b], edges: [link(a.id, b.id)] };
    const result = convertTimGraphToAls(graph, "Chain", [{ id: "1", name: "Alpha", active: true }]);
    assert.equal(result.ok, true);
    assert.ok(result.pipeline);
    const agentNodes = result.pipeline!.nodes.filter((n) => n.type === "agent");
    assert.equal(agentNodes.length, 2);
    assert.ok(result.pipeline!.edges.some((e) => e.from === a.id && e.to === b.id));
  });

  test("fan-out inserts a parallel hop", () => {
    const root = createNode("agent", { x: 0, y: 0 });
    const left = createNode("agent", { x: 100, y: -80 });
    const right = createNode("agent", { x: 100, y: 80 });
    const graph: Graph = {
      nodes: [root, left, right],
      edges: [link(root.id, left.id), link(root.id, right.id)],
    };
    const result = convertTimGraphToAls(graph, "Fan", []);
    assert.equal(result.ok, true);
    assert.ok(result.pipeline!.nodes.some((n) => n.type === "parallel"));
  });

  test("collectAgentDrafts reads names and roles", () => {
    const a = createNode("agent", { x: 0, y: 0 });
    if (a.data.kind === "agent") {
      a.data.name = "Writer";
      a.data.role = "Editor";
    }
    const graph: Graph = { nodes: [a], edges: [] };
    const drafts = collectAgentDrafts(graph);
    assert.equal(drafts[0]?.name, "Writer");
    assert.equal(drafts[0]?.role, "Editor");
  });
});
