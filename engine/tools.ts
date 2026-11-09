import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ToolServer } from "../shared/mesh";
import { listRecentMemories, queryMemories } from "./db";
import { resolveInside } from "./sandbox";

const exec = promisify(execFile);

export type ToolContext = {
  workspaceDir: string;
  mcpBridgeUrl: string;
  lmStudioUrl: string;
};

function textArg(args: Record<string, unknown>, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

export async function runTool(server: ToolServer, args: Record<string, unknown>, context: ToolContext): Promise<string> {
  try {
    if (server === "filesystem") return runFiles(args, context.workspaceDir);
    if (server === "bash") return runBash(textArg(args, "command"), context.workspaceDir);
    if (server === "git") return runGit(textArg(args, "op", "status"), context.workspaceDir);
    if (server === "sqlite") return runSql(textArg(args, "sql"));
    if (server === "memory") return runMemory(Number(args.limit ?? 12));
    if (server === "web_search") return runSearch(textArg(args, "q") || textArg(args, "query"));
    if (server === "fetch_url") return runFetch(textArg(args, "url"));
    if (server === "workspace_info") return runWorkspaceInfo(context.workspaceDir);
    if (server === "mcp_bridge") return runMcpBridge(textArg(args, "tool"), args, context);
    return `Unknown tool ${server}`;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
}

function runFiles(args: Record<string, unknown>, workspace: string): string {
  fs.mkdirSync(workspace, { recursive: true });
  const op = textArg(args, "op", "list");
  const target = resolveInside(workspace, textArg(args, "path", "."));
  if (op === "list") {
    const entries = fs.readdirSync(target, { withFileTypes: true }).slice(0, 200);
    if (entries.length === 0) return "(empty)";
    return entries.map((entry) => `${entry.isDirectory() ? "d" : "f"} ${entry.name}`).join("\n");
  }
  if (op === "read") {
    const stat = fs.statSync(target);
    if (stat.size > 64_000) return "File is larger than 64KB.";
    return fs.readFileSync(target, "utf8");
  }
  if (op === "write") {
    const content = textArg(args, "content");
    if (content.length > 200_000) return "Refusing a write larger than 200KB.";
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
    return `Wrote ${path.relative(workspace, target) || path.basename(target)}`;
  }
  return `Unsupported filesystem op ${op}`;
}

async function runBash(command: string, workspace: string): Promise<string> {
  const trimmed = command.trim();
  if (!trimmed) return "Missing command.";
  if (trimmed.length > 2000) return "Command is too long.";
  fs.mkdirSync(workspace, { recursive: true });
  try {
    const { stdout, stderr } = await exec("/bin/bash", ["-lc", trimmed], {
      cwd: workspace,
      timeout: 20000,
      maxBuffer: 200_000,
    });
    return `${stdout}${stderr}`.trim() || "(no output)";
  } catch (cause) {
    const error = cause as { stdout?: string; stderr?: string; message?: string };
    return `${error.stdout ?? ""}${error.stderr ?? error.message ?? "Command failed"}`.trim();
  }
}

async function runGit(op: string, workspace: string): Promise<string> {
  const args = op === "log" ? ["log", "-5", "--oneline"] : op === "diff" ? ["diff", "--stat"] : ["status", "--short"];
  try {
    const { stdout, stderr } = await exec("git", args, { cwd: workspace, timeout: 8000, maxBuffer: 200_000 });
    return `${stdout}${stderr}`.trim() || "(clean)";
  } catch (cause) {
    const error = cause as { stderr?: string; message?: string };
    return (error.stderr || error.message || "git failed").trim();
  }
}

function runSql(sql: string): string {
  if (!sql.trim()) return "Missing sql.";
  try {
    const rows = queryMemories(sql);
    return JSON.stringify(rows, null, 2).slice(0, 8000);
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
}

function runMemory(limit: number): string {
  const rows = listRecentMemories(Number.isFinite(limit) ? Math.min(50, Math.max(1, limit)) : 12);
  return JSON.stringify(rows, null, 2).slice(0, 8000);
}

function runWorkspaceInfo(workspace: string): string {
  fs.mkdirSync(workspace, { recursive: true });
  let files = 0;
  let bytes = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || files > 500) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile()) {
        files += 1;
        try {
          bytes += fs.statSync(full).size;
        } catch {
          // ignore
        }
      }
    }
  };
  walk(workspace, 0);
  return JSON.stringify({ workspace, files, bytes }, null, 2);
}

async function runFetch(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) return "Missing url.";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Invalid url.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "Only http and https URLs are allowed.";
  const response = await fetch(trimmed, { signal: AbortSignal.timeout(12000), redirect: "follow" });
  const text = await response.text();
  const snippet = text.slice(0, 32_000);
  return `status ${response.status}\n${snippet}`;
}

async function runMcpBridge(toolName: string, args: Record<string, unknown>, context: ToolContext): Promise<string> {
  const bridge = context.mcpBridgeUrl.trim();
  if (!bridge) {
    return "MCP bridge is not configured. Open Models and set MCP bridge URL (for example http://127.0.0.1:8765/mcp).";
  }
  if (!toolName.trim()) return "Missing tool name for MCP bridge. Pass {\"tool\":\"name\", ...args}.";
  let endpoint: URL;
  try {
    endpoint = new URL(bridge);
  } catch {
    return "MCP bridge URL is invalid.";
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") return "MCP bridge must be http or https.";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: toolName, arguments: args, lmStudioUrl: context.lmStudioUrl }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) return `MCP bridge error (${response.status}): ${text.slice(0, 2000)}`;
  return text.slice(0, 8000);
}

async function runSearch(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return "Missing query.";
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return `Search failed (${response.status})`;
  const body = (await response.json()) as {
    Heading?: string;
    AbstractText?: string;
    RelatedTopics?: { Text?: string }[];
  };
  const lines = [body.Heading, body.AbstractText].filter(Boolean);
  for (const topic of (body.RelatedTopics ?? []).slice(0, 5)) {
    if (topic.Text) lines.push(topic.Text);
  }
  return lines.join("\n") || "No instant answer.";
}
