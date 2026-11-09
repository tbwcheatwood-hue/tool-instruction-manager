import { Bot, Cpu, FolderOpen, GitBranch, Globe, Server, Split, Terminal, Wrench, type LucideIcon } from "lucide-react";
import { TOOL_CATALOG, type NodeKind, type ToolServer } from "../../shared/mesh";

export type PaletteGroupId = "mesh" | "models" | "tools" | "logic";

export type PaletteNodeItem = {
  kind: "node";
  id: string;
  group: PaletteGroupId;
  nodeKind: NodeKind;
  label: string;
  description: string;
  keywords: string;
  icon: LucideIcon;
};

export type PaletteToolItem = {
  kind: "tool";
  id: string;
  group: "tools";
  server: ToolServer;
  label: string;
  description: string;
  keywords: string;
  icon: LucideIcon;
  availability: "ready" | "setup";
};

export type PaletteItem = PaletteNodeItem | PaletteToolItem;

const toolIcons: Partial<Record<ToolServer, LucideIcon>> = {
  filesystem: FolderOpen,
  workspace_info: FolderOpen,
  git: GitBranch,
  bash: Terminal,
  sqlite: Server,
  memory: Server,
  web_search: Globe,
  fetch_url: Globe,
  mcp_bridge: Wrench,
};

export const PALETTE_GROUPS: { id: PaletteGroupId; label: string }[] = [
  { id: "mesh", label: "Mesh" },
  { id: "models", label: "Models" },
  { id: "tools", label: "Tools" },
  { id: "logic", label: "Logic" },
];

export const PALETTE_ITEMS: PaletteItem[] = [
  {
    kind: "node",
    id: "agent",
    group: "mesh",
    nodeKind: "agent",
    label: "Agent",
    description: "Role, prompt, and hand-offs",
    keywords: "agent assistant role prompt",
    icon: Bot,
  },
  {
    kind: "node",
    id: "llm",
    group: "models",
    nodeKind: "llm",
    label: "Local LLM",
    description: "LM Studio brain for agents",
    keywords: "model llm inference gpu",
    icon: Cpu,
  },
  {
    kind: "node",
    id: "router",
    group: "logic",
    nodeKind: "router",
    label: "Router",
    description: "Branch on message text",
    keywords: "router branch condition switch",
    icon: Split,
  },
  ...TOOL_CATALOG.map((tool) => ({
    kind: "tool" as const,
    id: `tool-${tool.id}`,
    group: "tools" as const,
    server: tool.id,
    label: tool.label,
    description: tool.hint,
    keywords: `${tool.id} ${tool.label} ${tool.category} mcp tool`,
    icon: toolIcons[tool.id] ?? Wrench,
    availability: tool.availability,
  })),
];
