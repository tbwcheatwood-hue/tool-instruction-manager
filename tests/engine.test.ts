import { describe, expect, it } from "vitest";
import { executeWorkflow } from "../src/engine/execute";
import { branchWorkflow, reviewPassWorkflow, reviewRejectWorkflow } from "../src/engine/examples";
import { reviewClaim } from "../src/engine/reviewer";
import type { ProviderConfig, Workflow } from "../src/shared/types";
import { WorkflowError, parseWorkflow } from "../src/shared/workflow";

const simulated: ProviderConfig = { id: "simulated", name: "Simulated", kind: "simulated", model: "simulated" };
const live: ProviderConfig = {
  id: "local",
  name: "Local",
  kind: "openai-compatible",
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "demo-model",
  apiKey: "sk-test-secret",
};

function chain(nodes: Workflow["nodes"], edges: Workflow["edges"], id = "t"): Workflow {
  return parseWorkflow({ id, name: id, nodes, edges });
}

describe("workflow execution", () => {
  it("passes a claimed completion when the upstream artifact exists", async () => {
    const result = await executeWorkflow(reviewPassWorkflow(), { input: "Weekly status: the report body.", providers: [simulated] });
    expect(result.status).toBe("ok");
    expect(result.artifacts.map((artifact) => artifact.name)).toEqual(["report"]);
    expect(result.artifacts[0]?.content).toContain("Weekly status");
    expect(result.nodeResults.review?.status).toBe("ok");
    expect(result.events.some((event) => event.kind === "tool_call")).toBe(true);
    expect(result.events.some((event) => event.kind === "model_response" && (event.payload as { simulated: boolean }).simulated)).toBe(true);
  });

  it("rejects a completion claim that has no supporting artifact", async () => {
    const result = await executeWorkflow(reviewRejectWorkflow(), { input: "nothing was written", providers: [simulated] });
    expect(result.status).toBe("rejected");
    expect(result.nodeResults.review?.status).toBe("rejected");
    const review = result.nodeResults.review?.output as { reasons: string[] };
    expect(review.reasons.join(" ")).toMatch(/Missing or empty artifact: report/);
    expect(review.reasons.join(" ")).toMatch(/no supporting artifacts/);
  });

  it("does not let a sibling artifact satisfy the reviewer", async () => {
    const workflow = chain(
      [
        { id: "input", kind: "input", label: "Input", position: { x: 0, y: 0 }, config: {} },
        { id: "writer", kind: "tool", label: "Writer", position: { x: 0, y: 0 }, config: { tool: "write_artifact", artifactName: "report", contentTemplate: "secret" } },
        { id: "agent", kind: "agent", label: "Agent", position: { x: 0, y: 0 }, config: { providerId: "simulated", claim: "task complete" } },
        { id: "review", kind: "reviewer", label: "Review", position: { x: 0, y: 0 }, config: { requiredArtifacts: ["report"] } },
      ],
      [
        { id: "e1", source: "input", target: "agent" },
        { id: "e2", source: "input", target: "writer" },
        { id: "e3", source: "agent", target: "review" },
      ],
    );
    const result = await executeWorkflow(workflow, { input: "hello", providers: [simulated] });
    expect(result.artifacts).toHaveLength(1);
    expect(result.nodeResults.review?.status).toBe("rejected");
  });

  it("runs independent branches in parallel and joins their text in edge order", async () => {
    const trace: string[] = [];
    const workflow = chain(
      [
        { id: "input", kind: "input", label: "Input", position: { x: 0, y: 0 }, config: {} },
        { id: "a", kind: "tool", label: "A", position: { x: 0, y: 0 }, config: { tool: "delay", delayMs: 40, note: "a" } },
        { id: "b", kind: "tool", label: "B", position: { x: 0, y: 0 }, config: { tool: "delay", delayMs: 40, note: "b" } },
        { id: "join", kind: "tool", label: "Join", position: { x: 0, y: 0 }, config: { tool: "concat", separator: "|" } },
        { id: "output", kind: "output", label: "Output", position: { x: 0, y: 0 }, config: {} },
      ],
      [
        { id: "e1", source: "input", target: "a" },
        { id: "e2", source: "input", target: "b" },
        { id: "e3", source: "a", target: "join" },
        { id: "e4", source: "b", target: "join" },
        { id: "e5", source: "join", target: "output" },
      ],
    );
    const result = await executeWorkflow(workflow, { input: "left\nright", providers: [simulated], trace });
    const starts = ["start:a", "start:b"].map((item) => trace.indexOf(item));
    const ends = ["end:a", "end:b"].map((item) => trace.indexOf(item));
    expect(Math.max(...starts)).toBeLessThan(Math.min(...ends));
    expect(trace.indexOf("end:a")).toBeLessThan(trace.indexOf("start:join"));
    expect(trace.indexOf("end:b")).toBeLessThan(trace.indexOf("start:join"));
    expect(result.nodeResults.join?.output).toMatchObject({ text: "left\nright|left\nright" });
  });

  it("keeps a dependent chain sequential", async () => {
    const trace: string[] = [];
    const workflow = chain(
      [
        { id: "input", kind: "input", label: "Input", position: { x: 0, y: 0 }, config: {} },
        { id: "a", kind: "tool", label: "A", position: { x: 0, y: 0 }, config: { tool: "delay", delayMs: 20 } },
        { id: "b", kind: "tool", label: "B", position: { x: 0, y: 0 }, config: { tool: "delay", delayMs: 20 } },
      ],
      [
        { id: "e1", source: "input", target: "a" },
        { id: "e2", source: "a", target: "b" },
      ],
    );
    await executeWorkflow(workflow, { input: "x", providers: [simulated], trace });
    expect(trace.indexOf("end:a")).toBeLessThan(trace.indexOf("start:b"));
  });

  it("follows only the matching branch and skips the other path", async () => {
    const result = await executeWorkflow(branchWorkflow(), { input: "please approve this", providers: [simulated] });
    expect(result.nodeResults.pass?.status).toBe("ok");
    expect(result.nodeResults.fail?.status).toBe("skipped");
    expect(JSON.stringify(result.output)).toContain("pass-path");
    expect(JSON.stringify(result.output)).not.toContain("fail-path");

    const failed = await executeWorkflow(branchWorkflow(), { input: "no thanks", providers: [simulated] });
    expect(failed.nodeResults.pass?.status).toBe("skipped");
    expect(failed.nodeResults.fail?.status).toBe("ok");
    expect(JSON.stringify(failed.output)).toContain("fail-path");
  });

  it("calls an OpenAI-compatible endpoint and keeps the api key out of the run log", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ choices: [{ message: { content: "model says task complete artifact:report" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const workflow = chain(
      [
        { id: "input", kind: "input", label: "Input", position: { x: 0, y: 0 }, config: {} },
        { id: "write", kind: "tool", label: "Write", position: { x: 0, y: 0 }, config: { tool: "write_artifact", artifactName: "report", contentTemplate: "{{input}}" } },
        { id: "agent", kind: "agent", label: "Agent", position: { x: 0, y: 0 }, config: { providerId: "local", model: "demo-model", temperature: 0 } },
        { id: "review", kind: "reviewer", label: "Review", position: { x: 0, y: 0 }, config: { requiredArtifacts: ["report"] } },
      ],
      [
        { id: "e1", source: "input", target: "write" },
        { id: "e2", source: "write", target: "agent" },
        { id: "e3", source: "agent", target: "review" },
      ],
    );
    const result = await executeWorkflow(workflow, { input: "evidence", providers: [simulated, live], fetchImpl });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer sk-test-secret");
    const body = JSON.parse(String(calls[0]?.init?.body)) as { model: string; messages: { role: string }[] };
    expect(body.model).toBe("demo-model");
    expect(body.messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(result.status).toBe("ok");
    expect(JSON.stringify(result)).not.toContain("sk-test-secret");
    expect(result.events.some((event) => event.kind === "model_response" && (event.payload as { simulated: boolean }).simulated === false)).toBe(true);
  });

  it("does not call fetch for the simulated provider", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("simulated provider called the network");
    };
    const result = await executeWorkflow(reviewPassWorkflow(), { input: "hello", providers: [simulated], fetchImpl });
    expect(result.status).toBe("ok");
  });

  it("records a provider failure on the agent node", async () => {
    const fetchImpl: typeof fetch = async () => new Response("nope", { status: 503 });
    const workflow = chain(
      [
        { id: "agent", kind: "agent", label: "Agent", position: { x: 0, y: 0 }, config: { providerId: "local", model: "demo-model" } },
      ],
      [],
    );
    const result = await executeWorkflow(workflow, { input: "hello", providers: [live], fetchImpl });
    expect(result.status).toBe("error");
    expect(result.nodeResults.agent?.error).toMatch(/HTTP 503/);
  });

  it("rejects a cycle before running nodes", async () => {
    const workflow = chain(
      [
        { id: "a", kind: "tool", label: "A", position: { x: 0, y: 0 }, config: { tool: "echo" } },
        { id: "b", kind: "tool", label: "B", position: { x: 0, y: 0 }, config: { tool: "echo" } },
      ],
      [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "a" },
      ],
    );
    await expect(executeWorkflow(workflow, { input: "x", providers: [simulated] })).rejects.toBeInstanceOf(WorkflowError);
  });

  it("round-trips workflow JSON", () => {
    const parsed = parseWorkflow(JSON.parse(JSON.stringify(reviewPassWorkflow())));
    expect(parsed.nodes).toHaveLength(5);
    expect(parsed.edges).toHaveLength(4);
    expect(() => parseWorkflow({ name: "bad", nodes: [{ id: "a", kind: "nope" }], edges: [] })).toThrow(WorkflowError);
  });
});

describe("reviewer rules", () => {
  it("passes when the claim and the artifact agree", () => {
    const result = reviewClaim({
      texts: ["task complete artifact:notes"],
      artifacts: [{ name: "notes", content: "real notes", producedBy: "tool" }],
      required: ["notes"],
      requireArtifactOnCompletion: true,
    });
    expect(result.verdict).toBe("pass");
  });
});
