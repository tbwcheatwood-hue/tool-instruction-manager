#!/usr/bin/env bash
# Option B: NOMAD AI uses your host Ollama on 11434 (no nomad_ollama container).
set -euo pipefail

NOMAD_ADMIN="${NOMAD_ADMIN:-http://127.0.0.1:8080}"
HOST_IP="${HOST_IP:-$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')}"
# Prefer host.docker.internal; fallback to LAN IP if Snap Ollama binds 0.0.0.0.
REMOTE_URL="${REMOTE_OLLAMA_URL:-http://host.docker.internal:11434}"

say() { printf '%s\n' "$*"; }

say "=== 1) Stop fighting Ollama services (run with sudo if needed) ==="
if systemctl is-enabled ollama &>/dev/null; then
  say "  Disabling systemd ollama (Snap can own 11434)..."
  sudo systemctl disable --now ollama 2>/dev/null || say "  (skip: could not disable systemd ollama)"
fi

say ""
say "=== 2) Host Ollama must be reachable FROM Docker ==="
say "  Snap often listens only on 127.0.0.1. NOMAD runs in Docker and uses host.docker.internal,"
say "  which usually hits your LAN interface — not loopback."
say ""
say "  If remote setup fails, restart Ollama listening on all interfaces, e.g.:"
say "    export OLLAMA_HOST=0.0.0.0:11434   # then restart your Snap/systemd ollama"
say "  Or set REMOTE_OLLAMA_URL=http://${HOST_IP}:11434 when re-running this script."
say ""

if ! curl -fsS "http://127.0.0.1:11434/v1/models" >/dev/null 2>&1; then
  say "ERROR: Nothing responding at http://127.0.0.1:11434/v1/models — start Snap Ollama first."
  exit 1
fi
say "OK: host Ollama responds on 127.0.0.1:11434"

if [[ -n "$HOST_IP" ]] && ! curl -fsS -m 3 "http://${HOST_IP}:11434/v1/models" >/dev/null 2>&1; then
  say ""
  say "WARN: Ollama is not reachable at http://${HOST_IP}:11434 — NOMAD in Docker will likely fail."
  say "      Bind with OLLAMA_HOST=0.0.0.0:11434 (see docs/NOMAD-OLLAMA-PORTS.md), then re-run."
  exit 1
fi
say "OK: Ollama reachable on LAN IP ${HOST_IP}:11434 (Docker can use host.docker.internal)"

say ""
say "=== 3) Tell NOMAD to use remote Ollama (skip nomad_ollama install) ==="
say "  POST ${NOMAD_ADMIN}/api/ollama/configure-remote"
say "  remoteUrl=${REMOTE_URL}"

resp="$(curl -fsS -X POST "${NOMAD_ADMIN}/api/ollama/configure-remote" \
  -H 'Content-Type: application/json' \
  -d "$(printf '{"remoteUrl":"%s"}' "$REMOTE_URL")")" || {
  say ""
  say "ERROR: configure-remote failed. Try in the NOMAD UI:"
  say "  AI Assistant → Settings → Models → Remote Ollama URL"
  say "  Use: ${REMOTE_URL}"
  say "  Or:  http://${HOST_IP}:11434"
  exit 1
}

say "$resp" | head -c 500
say ""
say ""
status="$(curl -fsS "${NOMAD_ADMIN}/api/ollama/remote-status" 2>/dev/null || true)"
say "remote-status: ${status:-(no response)}"
say ""
say "Done. Do NOT install nomad_ollama from the dashboard. Open NOMAD chat and pick a model."
