"use client";

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { relationOf, type GraphEdge } from "../../../shared/mesh";
import { useMesh } from "@/store/mesh";

export function MeshEdge(props: EdgeProps) {
  const [path] = getBezierPath(props);
  const active = useMesh((state) => state.activeEdgeIds.includes(props.id));
  const relation = relationOf(props as GraphEdge);
  const stroke = active
    ? "#DDD6FE"
    : relation === "brain"
      ? "rgba(221,214,254,0.88)"
      : relation === "tool"
        ? "rgba(197,212,161,0.95)"
        : "rgba(228,228,231,0.62)";
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{
          stroke,
          strokeWidth: active ? 2.25 : 1.35,
          strokeDasharray: active ? "6 8" : undefined,
          animation: active ? "tim-dash 0.8s linear infinite" : undefined,
        }}
      />
      {active && (
        <circle r="2.6" fill="#DDD6FE">
          <animateMotion dur="1.5s" repeatCount="indefinite" path={path} />
        </circle>
      )}
    </>
  );
}

export const edgeTypes = { mesh: MeshEdge };
