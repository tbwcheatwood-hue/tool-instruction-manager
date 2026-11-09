"use client";

import { Background, BackgroundVariant, Controls, ReactFlow, type Node } from "@xyflow/react";
import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import type { ToolServer } from "../../../shared/mesh";
import { useMesh } from "@/store/mesh";
import { edgeTypes } from "./MeshEdge";
import { nodeTypes } from "./nodes";

export function MeshCanvas() {
  const nodes = useMesh((state) => state.nodes);
  const edges = useMesh((state) => state.edges);
  const onNodesChange = useMesh((state) => state.onNodesChange);
  const onEdgesChange = useMesh((state) => state.onEdgesChange);
  const onConnect = useMesh((state) => state.onConnect);
  const addNode = useMesh((state) => state.addNode);
  const addToolNode = useMesh((state) => state.addToolNode);
  const openPanel = useMesh((state) => state.openPanel);
  const flowId = useMesh((state) => state.flowId);
  const studioView = useMesh((state) => state.studioView);
  const { screenToFlowPosition, fitView } = useReactFlow();

  useEffect(() => {
    const frame = requestAnimationFrame(() => fitView({ padding: 0.2 }));
    return () => cancelAnimationFrame(frame);
  }, [fitView, flowId]);

  useEffect(() => {
    if (studioView !== "mesh") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      if (useMesh.getState().studioView !== "mesh") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        requestAnimationFrame(() => fitView({ padding: 0.2, duration: 0 }));
      }, 120);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (timer) clearTimeout(timer);
    };
  }, [fitView, studioView]);

  return (
    <div className="relative min-w-0 flex-1" data-testid="mesh-canvas">
      <ReactFlow
        nodes={nodes as Node[]}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={() => openPanel("node")}
        onEdgeClick={() => openPanel("node")}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const kind = event.dataTransfer.getData("application/tim");
          const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          if (kind.startsWith("tool:")) {
            addToolNode(kind.slice(5) as ToolServer, position);
          } else if (kind === "agent" || kind === "llm" || kind === "tool" || kind === "router") {
            addNode(kind, position);
          } else return;
          openPanel("node");
        }}
        fitView
        proOptions={{ hideAttribution: false }}
        colorMode="dark"
        deleteKeyCode={["Backspace", "Delete"]}
        connectionLineStyle={{ stroke: "#DDD6FE", strokeWidth: 1.5 }}
        defaultEdgeOptions={{ type: "mesh" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgba(196,181,253,0.32)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  );
}
