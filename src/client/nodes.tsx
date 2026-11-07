import type { ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeData } from "./flow";

function Shell({ kind, label, status, children }: { kind: string; label: string; status?: string; children?: ReactNode }) {
  return (
    <div className={`arl-node kind-${kind} status-${status ?? "idle"}`}>
      <div className="node-top">
        <span className="kicker">{kind}</span>
        <span className={`status-dot status-${status ?? "idle"}`} title={status ?? "idle"} />
      </div>
      <div className="title">{label}</div>
      {children}
    </div>
  );
}

export function InputNode({ data }: NodeProps) {
  const node = data as NodeData;
  return (
    <Shell kind="input" label={node.label} status={node.status}>
      <Handle type="source" position={Position.Right} />
    </Shell>
  );
}

export function AgentNode({ data }: NodeProps) {
  const node = data as NodeData;
  return (
    <Shell kind="agent" label={node.label} status={node.status}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </Shell>
  );
}

export function ToolNode({ data }: NodeProps) {
  const node = data as NodeData;
  const tool = String(node.config.tool ?? "tool");
  return (
    <Shell kind="tool" label={node.label} status={node.status}>
      <div className="meta">{tool}</div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </Shell>
  );
}

export function BranchNode({ data }: NodeProps) {
  const node = data as NodeData;
  return (
    <Shell kind="branch" label={node.label} status={node.status}>
      <Handle type="target" position={Position.Left} />
      <Handle id="pass" type="source" position={Position.Right} style={{ top: 28 }} />
      <Handle id="fail" type="source" position={Position.Right} style={{ top: 52 }} />
      <div className="handles">
        <span>pass</span>
        <span>fail</span>
      </div>
    </Shell>
  );
}

export function ReviewerNode({ data }: NodeProps) {
  const node = data as NodeData;
  return (
    <Shell kind="reviewer" label={node.label} status={node.status}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </Shell>
  );
}

export function OutputNode({ data }: NodeProps) {
  const node = data as NodeData;
  return (
    <Shell kind="output" label={node.label} status={node.status}>
      <Handle type="target" position={Position.Left} />
    </Shell>
  );
}

export const nodeTypes = {
  input: InputNode,
  agent: AgentNode,
  tool: ToolNode,
  branch: BranchNode,
  reviewer: ReviewerNode,
  output: OutputNode,
};
