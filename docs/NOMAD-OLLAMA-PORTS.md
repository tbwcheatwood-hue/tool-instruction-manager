# NOMAD + host Ollama (same machine)

## What Tim checked (your machine)

| Check | Result |
|--------|--------|
| `ss -ltnp \| grep 11434` | **127.0.0.1:11434** — **Snap Ollama** (`/snap/ollama/141/bin/ollama serve`, pid 3489) |
| `snap services ollama` | `ollama.listener` **enabled / active** |
| `systemctl status ollama` | **enabled**; service in a restart loop when it cannot bind 11434 (high restart count) |
| `docker ps` | Needs `sudo` or `docker` group (permission denied from IDE sandbox) |

Host Ollama owns **11434**. NOMAD’s installer always tries **`0.0.0.0:11434:11434`** for `nomad_ollama`, so the install fails until something changes.

## Option B — Remote Ollama (chosen)

One-line helper (after Ollama is reachable from Docker — see below):

```bash
chmod +x ~/agent-routing-lab/scripts/nomad-remote-ollama.sh
~/agent-routing-lab/scripts/nomad-remote-ollama.sh
```

**Important on your machine:** Snap Ollama listens only on **127.0.0.1:11434**, so **`http://192.168.1.170:11434` does not work** from the host either. NOMAD (in Docker) must reach Ollama via **`host.docker.internal`**, which uses the host LAN stack — so bind Ollama on **all interfaces** first:

```bash
sudo systemctl disable --now ollama    # stop fighting Snap for the port
sudo snap stop ollama
# Snap reads OLLAMA_HOST from the daemon environment; common fix:
sudo mkdir -p /var/snap/ollama/common
echo 'OLLAMA_HOST=0.0.0.0:11434' | sudo tee /var/snap/ollama/common/host.env
sudo snap start ollama
curl -sS http://127.0.0.1:11434/api/tags | head
curl -sS http://192.168.1.170:11434/api/tags | head   # should return JSON, not fail
```

Then configure NOMAD (UI or script) with **`http://host.docker.internal:11434`**. **Do not** click Install on the local `nomad_ollama` tile.

**Manual UI path:** AI Assistant → Settings → Models → Remote Ollama URL → `http://host.docker.internal:11434`. Do **not** install the `nomad_ollama` Docker service.

## Option A — NOMAD-only Ollama (not using)

Stop host listeners on 11434, then install `nomad_ollama`:

```bash
sudo snap stop ollama
sudo systemctl stop ollama
sudo systemctl disable ollama
```

## T.I.M. note

T.I.M. **LM Studio / Ollama** connections use whatever URL you set in Connect (default `http://127.0.0.1:1234` for LM Studio). Host Ollama at **11434** is independent of NOMAD’s container port.
