"use client";

import { Loader2, Plus, Radar, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { engineFetch, type Settings } from "@/lib/engine";
import { CONNECTION_KIND_LABEL, type ConnectionKind, type ConnectionProfile, type DiscoveryReport } from "../../../shared/connections";
import { useMesh } from "@/store/mesh";

const KINDS: ConnectionKind[] = ["local", "lan", "ssh_tunnel", "phone", "custom"];

const kindDefaults: Record<ConnectionKind, Partial<ConnectionProfile>> = {
  local: { host: "127.0.0.1", baseUrl: "http://127.0.0.1:1234/v1", notes: "This machine. LM Studio or Ollama on loopback." },
  lan: { host: "", baseUrl: "", notes: "Direct LAN IP of another computer on Wi‑Fi or Ethernet." },
  ssh_tunnel: {
    host: "",
    sshUser: "user",
    sshPort: 22,
    localPort: 11434,
    remoteHost: "127.0.0.1",
    remotePort: 11434,
    notes: "Uses ssh -N -L to forward a remote inference port. Save LocalForward lines in ~/.ssh/config for daily use.",
  },
  phone: {
    host: "",
    baseUrl: "",
    notes: "Phone on the same LAN, USB tether, or Tailscale. Use SSH tunnel when the app binds to 127.0.0.1 on the phone.",
  },
  custom: { notes: "Any OpenAI-compatible base URL you reach manually." },
};

function emptyDraft(kind: ConnectionKind): ConnectionProfile {
  return {
    id: crypto.randomUUID(),
    name: CONNECTION_KIND_LABEL[kind],
    kind,
    host: "",
    enabled: true,
    updatedAt: new Date().toISOString(),
    ...kindDefaults[kind],
  };
}

export function ConnectionsPanel() {
  const settings = useMesh((state) => state.settings);
  const setSettings = useMesh((state) => state.setSettings);
  const setNotice = useMesh((state) => state.setNotice);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [draft, setDraft] = useState<ConnectionProfile>(emptyDraft("local"));
  const [report, setReport] = useState<DiscoveryReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [alsRoot, setAlsRoot] = useState(settings.alsRoot || "");
  const [alsApiUrl, setAlsApiUrl] = useState(settings.alsApiUrl || "");

  const refreshProfiles = () => void engineFetch<ConnectionProfile[]>("/connections").then(setProfiles).catch(() => setProfiles([]));

  useEffect(() => {
    refreshProfiles();
    setAlsRoot(settings.alsRoot || "");
    setAlsApiUrl(settings.alsApiUrl || "");
  }, [settings.alsRoot, settings.alsApiUrl]);

  const discover = async () => {
    setBusy(true);
    try {
      const data = await engineFetch<DiscoveryReport>("/connections/discover");
      setReport(data);
      setNotice(`Discovery finished: ${data.services.length} service(s).`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    try {
      const saved = await engineFetch<ConnectionProfile>("/connections", { method: "POST", body: JSON.stringify(draft) });
      setProfiles((list) => [saved, ...list.filter((item) => item.id !== saved.id)]);
      setNotice(`Saved connection ${saved.name}.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const startTunnel = async () => {
    try {
      await saveProfile();
      const status = await engineFetch<{ running: boolean; command: string; configSnippet: string }>("/connections/tunnel/start", {
        method: "POST",
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          sshHost: draft.host,
          sshUser: draft.sshUser || "user",
          sshPort: draft.sshPort || 22,
          localPort: draft.localPort || 11434,
          remoteHost: draft.remoteHost || "127.0.0.1",
          remotePort: draft.remotePort || 11434,
        }),
      });
      setNotice(status.running ? `Tunnel running on local port ${draft.localPort}.` : status.command);
      if (status.configSnippet) {
        setDraft((current) => ({ ...current, notes: `${current.notes ?? ""}\n\n${status.configSnippet}`.trim() }));
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const cleanupAls = async () => {
    setBusy(true);
    try {
      const next = await engineFetch<Settings>("/settings", { method: "PUT", body: JSON.stringify({ alsRoot, alsApiUrl }) });
      setSettings(next);
      const result = await engineFetch<{ removed: string[]; kept: number; error?: string }>("/connections/als/cleanup", { method: "POST" });
      if (result.error) setNotice(result.error);
      else setNotice(`ALS cleanup: removed ${result.removed.length}, kept ${result.kept}.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const registerAls = async () => {
    setBusy(true);
    try {
      const next = await engineFetch<Settings>("/settings", { method: "PUT", body: JSON.stringify({ alsRoot, alsApiUrl }) });
      setSettings(next);
      const result = await engineFetch<{ added: string[]; skipped: string[]; cleanup?: { removed: string[] }; error?: string }>("/connections/als/register", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (result.error) setNotice(result.error);
      else {
        const pruned = result.cleanup?.removed.length ?? 0;
        setNotice(`ALS: added ${result.added.length}, skipped ${result.skipped.length}, cleaned ${pruned}. Reload ALS providers or sync state.`);
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flex w-[236px] shrink-0 flex-col md:w-[260px]" data-testid="connections-panel">
      <div className="space-y-2 border-b border-lavender/25 px-3 py-3">
        <div className="font-mono text-[10px] tracking-[0.16em] text-lavender-bright">CONNECTION TYPES</div>
        <div className="grid grid-cols-2 gap-1">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setDraft(emptyDraft(kind))}
              className={`border px-1.5 py-1.5 text-left text-[10px] leading-snug focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lavender ${
                draft.kind === kind ? "border-lavender bg-black text-lavender-bright" : "border-lavender/20 text-zinc-300 hover:border-lavender/45"
              }`}
            >
              {CONNECTION_KIND_LABEL[kind]}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={() => void discover()} disabled={busy} data-testid="discover-network">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Radar size={12} />} Scan LAN
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <label className="block space-y-1">
          <Label>Name</Label>
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        {(draft.kind === "lan" || draft.kind === "phone" || draft.kind === "ssh_tunnel" || draft.kind === "custom") && (
          <label className="block space-y-1">
            <Label>{draft.kind === "ssh_tunnel" ? "SSH host" : "Host / IP"}</Label>
            <Input value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="192.168.1.42" className="font-mono text-xs" />
          </label>
        )}
        {draft.kind === "ssh_tunnel" && (
          <>
            <label className="block space-y-1">
              <Label>SSH user</Label>
              <Input value={draft.sshUser || ""} onChange={(e) => setDraft({ ...draft, sshUser: e.target.value })} className="font-mono text-xs" />
            </label>
            <label className="block space-y-1">
              <Label>Local → remote forward</Label>
              <div className="grid grid-cols-2 gap-1">
                <Input type="number" value={draft.localPort ?? 11434} onChange={(e) => setDraft({ ...draft, localPort: Number(e.target.value) })} aria-label="Local port" />
                <Input type="number" value={draft.remotePort ?? 11434} onChange={(e) => setDraft({ ...draft, remotePort: Number(e.target.value) })} aria-label="Remote port" />
              </div>
              <p className="text-[10px] text-zinc-500">
                ssh -N -L {draft.localPort}:{draft.remoteHost || "127.0.0.1"}:{draft.remotePort} {draft.sshUser}@{draft.host || "host"}
              </p>
            </label>
          </>
        )}
        <label className="block space-y-1">
          <Label>API base URL</Label>
          <Input value={draft.baseUrl || ""} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="http://127.0.0.1:1234/v1" className="font-mono text-xs" />
        </label>
        {draft.notes && <p className="text-[10px] leading-relaxed text-zinc-500">{draft.notes}</p>}
        <div className="flex gap-1">
          <Button variant="outline" className="flex-1" onClick={() => void saveProfile()}>
            <Save size={12} /> Save
          </Button>
          {draft.kind === "ssh_tunnel" && (
            <Button className="flex-1" onClick={() => void startTunnel()}>
              <Plus size={12} /> Tunnel
            </Button>
          )}
        </div>

        <div className="border-t border-lavender/20 pt-3">
          <Label>ALS (Autonomous Loop Studio)</Label>
          <Input value={alsRoot} onChange={(e) => setAlsRoot(e.target.value)} className="mt-1 font-mono text-[10px]" placeholder="Path to Autonomous-master" />
          <Input value={alsApiUrl} onChange={(e) => setAlsApiUrl(e.target.value)} className="mt-1 font-mono text-[10px]" placeholder="http://127.0.0.1:8888" />
          <Button variant="olive" className="mt-2 w-full" onClick={() => void registerAls()} disabled={busy}>
            Register verified endpoints
          </Button>
          <Button variant="outline" className="mt-2 w-full" onClick={() => void cleanupAls()} disabled={busy} data-testid="als-cleanup">
            Clean bogus providers
          </Button>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
            Register merges new providers into ALS storage/state.json without replacing existing URLs. Cleanup removes junk rows, fixes endpoints that stop at /v1 (LM Studio “Unexpected endpoint”), sets local auth to none + key local, and dedupes (also runs before register).
          </p>
        </div>

        {report && (
          <div className="border border-lavender/25 p-2">
            <div className="font-mono text-[10px] text-lavender-bright">DISCOVERY</div>
            <p className="mt-1 text-[10px] text-zinc-400">
              {report.host.hostname} · {report.host.addresses.map((a) => a.ip).join(", ")}
            </p>
            {report.incomplete && <p className="mt-1 text-[10px] text-amber-300">{report.incomplete}</p>}
            <div className="mt-2 space-y-1">
              {report.services.length === 0 && <p className="text-[10px] text-zinc-500">No APIs found.</p>}
              {report.services.map((service, index) => (
                <button
                  key={`${service.ip}:${service.port}:${index}`}
                  type="button"
                  className="block w-full border border-lavender/20 px-2 py-1 text-left hover:border-lavender/50"
                  onClick={() =>
                    setDraft({
                      ...emptyDraft("lan"),
                      name: `${service.serverKind} ${service.ip}`,
                      host: service.ip,
                      baseUrl: service.baseUrl,
                      serverKind: service.serverKind,
                      modelIds: service.models,
                    })
                  }
                >
                  <div className="text-[10px] text-zinc-100">
                    {service.serverKind} · {service.ip}:{service.port}
                  </div>
                  <div className="text-[10px] text-olive-bright">{service.reachable ? "reachable" : "listed only"} · {service.models[0] || "no models"}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label>Saved</Label>
          {profiles.length === 0 && <p className="text-[10px] text-zinc-500">No saved connections.</p>}
          {profiles.map((item) => (
            <button key={item.id} type="button" className="mt-1 block w-full border border-lavender/15 px-2 py-1 text-left text-[10px] text-zinc-300 hover:border-lavender/40" onClick={() => setDraft(item)}>
              {item.name} <span className="text-zinc-500">({item.kind})</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
