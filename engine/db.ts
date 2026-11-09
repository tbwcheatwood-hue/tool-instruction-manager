import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ConnectionProfile } from "../shared/connections";
import { EXAMPLE_FLOW_ID, exampleGraph, type FlowRecord, type Graph } from "../shared/mesh";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "tim.sqlite"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS flows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    graph TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function rowToFlow(row: { id: string; name: string; graph: string; updated_at: string }): FlowRecord {
  const graph = JSON.parse(row.graph) as Graph;
  return { id: row.id, name: row.name, graph, updatedAt: row.updated_at };
}

export function listFlows(): FlowRecord[] {
  const rows = db.prepare("SELECT id, name, graph, updated_at FROM flows ORDER BY updated_at DESC").all() as {
    id: string;
    name: string;
    graph: string;
    updated_at: string;
  }[];
  return rows.map(rowToFlow);
}

export function getFlow(id: string): FlowRecord | null {
  const row = db.prepare("SELECT id, name, graph, updated_at FROM flows WHERE id = ?").get(id) as
    | { id: string; name: string; graph: string; updated_at: string }
    | undefined;
  return row ? rowToFlow(row) : null;
}

export function saveFlow(id: string, name: string, graph: Graph): FlowRecord {
  const updatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO flows (id, name, graph, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, graph = excluded.graph, updated_at = excluded.updated_at`,
  ).run(id, name, JSON.stringify(graph), updatedAt);
  return { id, name, graph, updatedAt };
}

export function deleteFlow(id: string): void {
  db.prepare("DELETE FROM flows WHERE id = ?").run(id);
}

export function ensureExample(): FlowRecord {
  const existing = getFlow(EXAMPLE_FLOW_ID);
  if (existing) return existing;
  return saveFlow(EXAMPLE_FLOW_ID, "Mesh", exampleGraph());
}

export function remember(flowId: string, agentId: string, role: string, content: string): void {
  db.prepare("INSERT INTO memories (id, flow_id, agent_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    crypto.randomUUID(),
    flowId,
    agentId,
    role,
    content.slice(0, 20000),
    new Date().toISOString(),
  );
}

export function listRecentMemories(limit = 12): { flow_id: string; agent_id: string; role: string; content: string; created_at: string }[] {
  return db
    .prepare("SELECT flow_id, agent_id, role, content, created_at FROM memories ORDER BY created_at DESC LIMIT ?")
    .all(limit) as { flow_id: string; agent_id: string; role: string; content: string; created_at: string }[];
}

export function recall(flowId: string, agentId: string, limit = 6): { role: string; content: string }[] {
  const rows = db
    .prepare(
      "SELECT role, content FROM memories WHERE flow_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(flowId, agentId, limit) as { role: string; content: string }[];
  return rows.reverse();
}

export function recordRun(id: string, flowId: string, status: string): void {
  db.prepare(
    `INSERT INTO runs (id, flow_id, status, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status`,
  ).run(id, flowId, status, new Date().toISOString());
}

export function getSetting(key: string, fallback: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function queryMemories(sql: string): unknown[] {
  const trimmed = sql.trim();
  if (!/^\s*(select|with)\b/i.test(trimmed)) throw new Error("Only SELECT queries are allowed");
  if (trimmed.includes(";")) throw new Error("One statement only");
  return db.prepare(trimmed).all();
}

export const defaultWorkspace = path.join(dataDir, "workspace");

export function listConnections(): ConnectionProfile[] {
  const rows = db.prepare("SELECT payload FROM connections ORDER BY updated_at DESC").all() as { payload: string }[];
  return rows.map((row) => JSON.parse(row.payload) as ConnectionProfile);
}

export function saveConnection(profile: ConnectionProfile): ConnectionProfile {
  const updatedAt = new Date().toISOString();
  const saved = { ...profile, updatedAt };
  db.prepare(
    `INSERT INTO connections (id, name, kind, payload, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, payload = excluded.payload, updated_at = excluded.updated_at`,
  ).run(saved.id, saved.name, saved.kind, JSON.stringify(saved), updatedAt);
  return saved;
}

export function deleteConnection(id: string): void {
  db.prepare("DELETE FROM connections WHERE id = ?").run(id);
}
