import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { cleanupAlsProviders, normalizeChatEndpoint, registerServicesInAls, resolveAlsPaths } from "./alsProviders";
import type { DiscoveredService } from "../shared/connections";

function tmpAlsRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tim-als-"));
  fs.mkdirSync(path.join(dir, "storage"), { recursive: true });
  return dir;
}

test("normalizeChatEndpoint fixes bare /v1 OpenAI base URLs", () => {
  assert.equal(normalizeChatEndpoint("http://127.0.0.1:1234/v1"), "http://127.0.0.1:1234/v1/chat/completions");
  assert.equal(normalizeChatEndpoint("https://integrate.api.nvidia.com/v1"), "https://integrate.api.nvidia.com/v1/chat/completions");
});

test("cleanupAlsProviders repairs short /v1 endpoints and local auth", () => {
  const root = tmpAlsRoot();
  const paths = resolveAlsPaths(root);
  const state = {
    rev: 1,
    slots: {
      providers: [
        {
          id: "nv",
          name: "Nvidia",
          endpoint: "https://integrate.api.nvidia.com/v1",
          models: ["nvidia/foo"],
          apiKey: "",
          authType: "bearer",
        },
        {
          id: "tim_127_0_0_1_1234_lmstudio",
          name: "lmstudio @ 127.0.0.1:1234",
          endpoint: "http://127.0.0.1:1234/v1",
          models: ["m1"],
          apiKey: "",
          authType: "bearer",
        },
      ],
    },
  };
  fs.writeFileSync(paths.stateFile, JSON.stringify(state));
  const result = cleanupAlsProviders(paths);
  assert.equal(result.kept, 2);
  const after = JSON.parse(fs.readFileSync(paths.stateFile, "utf8")) as typeof state;
  assert.equal(after.slots.providers[1].endpoint, "http://127.0.0.1:1234/v1/chat/completions");
  assert.equal(after.slots.providers[1].authType, "none");
  assert.equal(after.slots.providers[1].apiKey, "local");
});

test("cleanupAlsProviders removes empty models and duplicate endpoints", () => {
  const root = tmpAlsRoot();
  const paths = resolveAlsPaths(root);
  const state = {
    rev: 1,
    slots: {
      providers: [
        { id: "bad", name: "router", endpoint: "http://192.168.1.1:8080/v1/chat/completions", models: [] },
        { id: "good", name: "lm", endpoint: "http://127.0.0.1:1234/v1/chat/completions", models: ["m1"] },
        { id: "dup", name: "lm copy", endpoint: "http://127.0.0.1:1234/v1/chat/completions", models: ["m2"] },
      ],
    },
  };
  fs.writeFileSync(paths.stateFile, JSON.stringify(state));
  const result = cleanupAlsProviders(paths);
  assert.equal(result.removed.length, 2);
  assert.equal(result.kept, 1);
  const after = JSON.parse(fs.readFileSync(paths.stateFile, "utf8")) as typeof state;
  assert.equal(after.slots.providers.length, 1);
});

test("registerServicesInAls runs cleanup then merges providers", () => {
  const root = tmpAlsRoot();
  const paths = resolveAlsPaths(root);
  fs.writeFileSync(
    paths.stateFile,
    JSON.stringify({
      rev: 0,
      slots: { providers: [{ id: "junk", name: "junk", endpoint: "http://x/v1/chat/completions", models: [] }] },
    }),
  );
  const service: DiscoveredService = {
    ip: "127.0.0.1",
    port: 1234,
    serverKind: "lmstudio",
    baseUrl: "http://127.0.0.1:1234/v1",
    models: ["test-model"],
    running: true,
    reachable: true,
    detail: "ok",
    probeAt: new Date().toISOString(),
  };
  const result = registerServicesInAls(paths, [service]);
  assert.ok(result.cleanup);
  assert.equal(result.added.length, 1);
  const after = JSON.parse(fs.readFileSync(paths.stateFile, "utf8")) as { slots: { providers: { models: string[] }[] } };
  assert.equal(after.slots.providers.length, 1);
  assert.deepEqual(after.slots.providers[0].models, ["test-model"]);
});
