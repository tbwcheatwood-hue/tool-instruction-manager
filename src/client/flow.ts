import type { Edge, Node } from "@xyflow/react";
import type { NodeKind, Workflow } from "../shared/types";
import { defaultConfig, defaultLabel, parseWorkflow } from "../shared/workflow";

export interface NodeData extends Record<string, unknown> {
  label: string;
  kind: NodeKind;
  config: Record<string, unknown>;
  status?: string;
}

export function toFlow(workflow: Workflow): { nodes: Node<NodeData>[]; edges: Edge[] } {
  return {
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      type: node.kind,
      position: node.position,
      data: { label: node.label, kind: node.kind, config: node.config, status: "idle" },
    })),
    edges: workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      label: edge.sourceHandle,
    })),
  };
}

export function toWorkflow(name: string, id: string, nodes: Node<NodeData>[], edges: Edge[]): Workflow {
  return parseWorkflow({
    id,
    name,
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: (node.data.kind ?? node.type) as NodeKind,
      label: node.data.label,
      position: node.position,
      config: node.data.config,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
    })),
  });
}

export function createFlowNode(kind: NodeKind, position: { x: number; y: number }): Node<NodeData> {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return {
    id,
    type: kind,
    position,
    data: { label: defaultLabel(kind), kind, config: defaultConfig(kind), status: "idle" },
  };
}
