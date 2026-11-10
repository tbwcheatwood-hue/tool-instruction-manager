import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AlsPipeline } from "../../shared/alsRouting";
import { convertAlsPipelineToTim } from "./alsToTim";

describe("alsToTim", () => {
  test("serial agents become flow edges", () => {
    const pipeline: AlsPipeline = {
      id: "wf1",
      name: "Two-step",
      nodes: [
        { id: "n1", type: "agent", x: 0, y: 0, agentId: "ag1", attachments: [] },
        { id: "n2", type: "agent", x: 200, y: 0, agentId: "ag2", attachments: [] },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", mode: "serial" }],
    };
    const agents = [
      { id: "ag1", name: "One", systemPrompt: "First", active: true },
      { id: "ag2", name: "Two", systemPrompt: "Second", active: true },
    ];
    const result = convertAlsPipelineToTim(pipeline, agents);
    assert.equal(result.ok, true);
    assert.equal(result.graph?.nodes.length, 2);
    assert.equal(result.graph?.edges.length, 1);
    assert.equal(result.graph?.edges[0]?.data?.relation, "flow");
  });

  test("merge and parallel collapse to agent flow", () => {
    const pipeline: AlsPipeline = {
      id: "wf2",
      name: "Via merge",
      nodes: [
        { id: "a1", type: "agent", x: 0, y: 0, agentId: "x", attachments: [] },
        { id: "a2", type: "agent", x: 0, y: 80, agentId: "y", attachments: [] },
        { id: "m", type: "merge", x: 120, y: 40, attachments: [] },
        { id: "a3", type: "agent", x: 240, y: 40, agentId: "z", attachments: [] },
      ],
      edges: [
        { id: "e1", from: "a1", to: "m", mode: "serial" },
        { id: "e2", from: "a2", to: "m", mode: "serial" },
        { id: "e3", from: "m", to: "a3", mode: "serial" },
      ],
    };
    const agents = [
      { id: "x", name: "X", active: true },
      { id: "y", name: "Y", active: true },
      { id: "z", name: "Z", active: true },
    ];
    const result = convertAlsPipelineToTim(pipeline, agents);
    assert.equal(result.ok, true);
    assert.ok((result.graph?.edges.length ?? 0) >= 2);
  });
});
