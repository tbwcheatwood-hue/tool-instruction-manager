import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import type { AlsPipeline } from "../shared/alsRouting";
import { ensureAgents, mergePipeline, readAlsState } from "./alsState";

function tempAlsRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tim-als-"));
  fs.mkdirSync(path.join(dir, "storage"), { recursive: true });
  fs.writeFileSync(path.join(dir, "storage", "state.json"), JSON.stringify({ rev: 1, slots: { agents: [], pipelines: [] } }));
  return dir;
}

describe("alsState", () => {
  test("ensureAgents matches and creates", () => {
    const root = tempAlsRoot();
    const paths = { root, stateFile: path.join(root, "storage", "state.json") };
    fs.writeFileSync(
      paths.stateFile,
      JSON.stringify({
        rev: 1,
        slots: { agents: [{ id: "a1", name: "Existing", active: true, models: [] }], pipelines: [], providers: [] },
      }),
    );
    const touch = ensureAgents(paths, [
      { name: "Existing", role: "R" },
      { name: "Newbie", role: "Writer", systemPrompt: "Hi" },
    ]);
    assert.equal(touch.touch.matched.length, 1);
    assert.equal(touch.touch.created.length, 1);
    const { state } = readAlsState(paths);
    assert.equal(state?.slots?.agents?.length, 2);
  });

  test("mergePipeline upserts by id", () => {
    const root = tempAlsRoot();
    const paths = { root, stateFile: path.join(root, "storage", "state.json") };
    const pipeline: AlsPipeline = {
      id: "p1",
      name: "First",
      nodes: [],
      edges: [],
    };
    mergePipeline(paths, pipeline);
    mergePipeline(paths, { ...pipeline, name: "Renamed" });
    const { state } = readAlsState(paths);
    assert.equal(state?.slots?.pipelines?.length, 1);
    assert.equal(state?.slots?.pipelines?.[0]?.name, "Renamed");
  });
});
