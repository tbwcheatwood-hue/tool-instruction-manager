import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type TunnelSpec = {
  id: string;
  name: string;
  sshHost: string;
  sshUser: string;
  sshPort: number;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  identityFile?: string;
};

export type TunnelStatus = TunnelSpec & {
  pid: number | null;
  running: boolean;
  command: string;
  configSnippet: string;
};

const pidDir = path.join(process.cwd(), "data", "tunnels");

function pidPath(id: string): string {
  return path.join(pidDir, `${id}.pid`);
}

function readPid(id: string): number | null {
  try {
    const n = Number(fs.readFileSync(pidPath(id), "utf8").trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function isRunning(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function buildSshConfigSnippet(spec: Omit<TunnelSpec, "id" | "name">, hostAlias: string): string {
  const lines = [
    `Host ${hostAlias}`,
    `  HostName ${spec.sshHost}`,
    `  User ${spec.sshUser}`,
    `  Port ${spec.sshPort}`,
    `  LocalForward ${spec.localPort} ${spec.remoteHost}:${spec.remotePort}`,
  ];
  if (spec.identityFile) lines.push(`  IdentityFile ${spec.identityFile}`);
  lines.push("  # Run: ssh -N " + hostAlias);
  return lines.join("\n");
}

export function buildSshCommand(spec: TunnelSpec): string {
  const args = [
    "-N",
    "-L",
    `${spec.localPort}:${spec.remoteHost}:${spec.remotePort}`,
    "-p",
    String(spec.sshPort),
    ...(spec.identityFile ? ["-i", spec.identityFile] : []),
    `${spec.sshUser}@${spec.sshHost}`,
  ];
  return `ssh ${args.join(" ")}`;
}

export function startTunnel(spec: TunnelSpec): TunnelStatus {
  fs.mkdirSync(pidDir, { recursive: true });
  const existing = readPid(spec.id);
  if (isRunning(existing)) {
    return tunnelStatus(spec, existing);
  }
  const child = spawn(
    "ssh",
    [
      "-N",
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ServerAliveInterval=30",
      "-L",
      `${spec.localPort}:${spec.remoteHost}:${spec.remotePort}`,
      "-p",
      String(spec.sshPort),
      ...(spec.identityFile ? ["-i", spec.identityFile] : []),
      `${spec.sshUser}@${spec.sshHost}`,
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  if (!child.pid) throw new Error("SSH tunnel did not start.");
  fs.writeFileSync(pidPath(spec.id), String(child.pid));
  return tunnelStatus(spec, child.pid);
}

export function stopTunnel(id: string): { stopped: boolean; pid: number | null } {
  const pid = readPid(id);
  if (!pid) return { stopped: false, pid: null };
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // already dead
  }
  try {
    fs.unlinkSync(pidPath(id));
  } catch {
    // ignore
  }
  return { stopped: true, pid };
}

export function tunnelStatus(spec: TunnelSpec, pid: number | null = readPid(spec.id)): TunnelStatus {
  const running = isRunning(pid);
  return {
    ...spec,
    pid: running ? pid : null,
    running,
    command: buildSshCommand(spec),
    configSnippet: buildSshConfigSnippet(spec, `tim-${spec.id.slice(0, 8)}`),
  };
}
