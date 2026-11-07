import type { Workflow, WorkflowEdge, WorkflowNode } from "../shared/types";
import { defaultConfig } from "../shared/workflow";

function node(id: string, kind: WorkflowNode["kind"], x: number, y: number, label: string, config: Record<string, unknown> = {}): WorkflowNode {
  return {
    id,
    kind,
    label,
    position: { x, y },
    config: { ...defaultConfig(kind), ...config },
  };
}

function edge(id: string, source: string, target: string, sourceHandle?: string): WorkflowEdge {
  return { id, source, target, sourceHandle };
}

const stamp = "2026-01-01T00:00:00.000Z";

export function reviewPassWorkflow(): Workflow {
  return {
    id: "example-pass",
    name: "Review pass",
    version: 1,
    updatedAt: stamp,
    nodes: [
      node("input", "input", 40, 120, "Input"),
      node("write", "tool", 280, 120, "Write report", { tool: "write_artifact", artifactName: "report", contentTemplate: "{{input}}" }),
      node("agent", "agent", 540, 120, "Drafter", {
        name: "Drafter",
        role: "writer",
        providerId: "simulated",
        claim: "task complete artifact:report",
      }),
      node("review", "reviewer", 800, 120, "Reviewer", { requiredArtifacts: ["report"], requireArtifactOnCompletion: true }),
      node("output", "output", 1040, 120, "Output"),
    ],
    edges: [
      edge("e1", "input", "write"),
      edge("e2", "write", "agent"),
      edge("e3", "agent", "review"),
      edge("e4", "review", "output"),
    ],
  };
}

export function reviewRejectWorkflow(): Workflow {
  return {
    id: "example-reject",
    name: "Review reject",
    version: 1,
    updatedAt: stamp,
    nodes: [
      node("input", "input", 40, 120, "Input"),
      node("agent", "agent", 320, 120, "Claimant", {
        name: "Claimant",
        role: "assistant",
        providerId: "simulated",
        claim: "task complete",
      }),
      node("review", "reviewer", 600, 120, "Reviewer", { requiredArtifacts: ["report"], requireArtifactOnCompletion: true }),
      node("output", "output", 860, 120, "Output"),
    ],
    edges: [edge("e1", "input", "agent"), edge("e2", "agent", "review"), edge("e3", "review", "output")],
  };
}

export function branchWorkflow(): Workflow {
  return {
    id: "example-branch",
    name: "Branch",
    version: 1,
    updatedAt: stamp,
    nodes: [
      node("input", "input", 40, 160, "Input"),
      node("branch", "branch", 300, 160, "Contains approve", { mode: "contains", value: "approve", path: "" }),
      node("pass", "tool", 580, 40, "Pass path", { tool: "template", contentTemplate: "pass-path" }),
      node("fail", "tool", 580, 280, "Fail path", { tool: "template", contentTemplate: "fail-path" }),
      node("output", "output", 860, 160, "Output"),
    ],
    edges: [
      edge("e1", "input", "branch"),
      edge("e2", "branch", "pass", "pass"),
      edge("e3", "branch", "fail", "fail"),
      edge("e4", "pass", "output"),
      edge("e5", "fail", "output"),
    ],
  };
}

export function examples(): Workflow[] {
  return [reviewPassWorkflow(), reviewRejectWorkflow(), branchWorkflow()];
}
