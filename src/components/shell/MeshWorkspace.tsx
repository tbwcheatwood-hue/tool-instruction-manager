"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { MeshCanvas } from "@/components/canvas/MeshCanvas";
import { Inspector } from "@/components/shell/Inspector";
import { ModelHub } from "@/components/shell/ModelHub";
import { SidebarShell } from "@/components/shell/SidebarShell";
import { useMesh } from "@/store/mesh";

export function MeshWorkspace() {
  const panel = useMesh((state) => state.panel);
  const panelOpen = useMesh((state) => state.panelOpen);

  return (
    <ReactFlowProvider>
      <div className="flex min-h-0 min-w-0 flex-1">
        <SidebarShell />
        <MeshCanvas />
        {panelOpen && (panel === "models" ? <ModelHub /> : <Inspector />)}
      </div>
    </ReactFlowProvider>
  );
}
