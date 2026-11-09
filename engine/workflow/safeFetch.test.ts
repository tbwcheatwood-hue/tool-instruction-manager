import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicGithubRaw, isAllowlistedRepo } from "./safeFetch";

test("assertPublicGithubRaw rejects non-github hosts", () => {
  assert.throws(() => assertPublicGithubRaw("http://127.0.0.1/workflow.json"), /Only https/);
  assert.throws(() => assertPublicGithubRaw("https://evil.example/workflow.json"), /allowlisted|Remote import/);
});

test("assertPublicGithubRaw rejects non-allowlisted repos", () => {
  assert.throws(
    () => assertPublicGithubRaw("https://raw.githubusercontent.com/evil/hack/main/flow.json"),
    /allowlisted/,
  );
});

test("allowlisted repos include langflow starter tree", () => {
  assert.equal(isAllowlistedRepo("langflow-ai/langflow"), true);
  assert.equal(isAllowlistedRepo("n8n-io/n8n-workflows"), true);
});
