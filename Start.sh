#!/usr/bin/env bash
# Start Agent Routing Lab in development mode (API on port 8787, UI on port 5173).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

die() {
  echo "Agent Routing Lab: $*" >&2
  exit 1
}

node_major() {
  local version major
  version="$("$1" -v 2>/dev/null || true)"
  major="${version#v}"
  major="${major%%.*}"
  if [[ "$major" =~ ^[0-9]+$ ]]; then
    echo "$major"
  else
    echo 0
  fi
}

pick_node() {
  local candidate major
  local -a candidates=()
  if [[ -n "${NODE_BIN:-}" ]]; then
    candidates+=("$NODE_BIN")
  fi
  if command -v node >/dev/null 2>&1; then
    candidates+=("$(command -v node)")
  fi
  if [[ -x "$HOME/.local/node/bin/node" ]]; then
    candidates+=("$HOME/.local/node/bin/node")
  fi
  for candidate in "${candidates[@]}"; do
    [[ -x "$candidate" ]] || continue
    major="$(node_major "$candidate")"
    if (( major >= 20 )); then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

port_open() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn | grep -q ":${port} "
    return
  fi
  (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

NODE="$(pick_node)" || die "Node.js 20 or newer is required. The node command on PATH is too old or missing. Install Node 20+ and run this script again. On this machine, Node 22 may already be at ~/.local/node if that directory exists."
export PATH="$(dirname "$NODE"):$PATH"

command -v npm >/dev/null 2>&1 || die "npm was not found next to ${NODE}. Install Node.js 20 or newer, which includes npm."
[[ -f package.json ]] || die "package.json was not found in ${ROOT}."

if [[ ! -x node_modules/.bin/vite || ! -x node_modules/.bin/tsx ]]; then
  echo "Installing dependencies (first launch)..."
  npm install || die "npm install failed. Check the messages above, then run ./Start.sh again."
fi

STUDIO_PID=""
cleanup() {
  if [[ -n "${STUDIO_PID}" ]]; then
    kill "${STUDIO_PID}" 2>/dev/null || true
    wait "${STUDIO_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

start_studio() {
  local studio="$ROOT/autonomous"
  if [[ ! -x "$studio/start.sh" ]]; then
    echo "Autonomous Loop Studio was not found at autonomous/start.sh."
    return 0
  fi
  if ! command -v php >/dev/null 2>&1; then
    echo "Autonomous Loop Studio needs PHP with the curl extension."
    echo "The routing lab will still start. Install PHP, then run ./Start.sh again:"
    echo "  sudo apt install php-cli php-curl php-mbstring php-zip"
    return 0
  fi
  mkdir -p "$ROOT/data"
  if [[ -f "$ROOT/data/autonomous.url" ]]; then
    local saved
    saved="$(tr -d '[:space:]' < "$ROOT/data/autonomous.url")"
    local saved_port="${saved##*:}"
    saved_port="${saved_port%/}"
    if [[ "$saved_port" =~ ^[0-9]+$ ]] && port_open "$saved_port"; then
      echo "Autonomous Loop Studio already appears to be at ${saved}"
      return 0
    fi
  fi
  echo "Starting Autonomous Loop Studio from autonomous/"
  : > "$ROOT/data/autonomous.log"
  (
    cd "$studio"
    nohup ./start.sh 8080
  ) >> "$ROOT/data/autonomous.log" 2>&1 &
  STUDIO_PID=$!
  local _
  for _ in $(seq 1 50); do
    if grep -q "Loop Studio at" "$ROOT/data/autonomous.log" 2>/dev/null; then
      grep -oE 'http://127.0.0.1:[0-9]+/' "$ROOT/data/autonomous.log" | head -1 > "$ROOT/data/autonomous.url"
      echo "Loop Studio: $(tr -d '[:space:]' < "$ROOT/data/autonomous.url")"
      echo "First-run token, if one was created, is in the log below."
      sed -n '1,40p' "$ROOT/data/autonomous.log"
      return 0
    fi
    if ! kill -0 "$STUDIO_PID" 2>/dev/null; then
      echo "Autonomous Loop Studio exited. See data/autonomous.log:"
      sed -n '1,40p' "$ROOT/data/autonomous.log" || true
      STUDIO_PID=""
      return 0
    fi
    sleep 0.2
  done
  echo "Autonomous Loop Studio is still starting. See data/autonomous.log."
}

start_studio

if port_open 5173 || port_open 8787; then
  echo "Agent Routing Lab already appears to be running."
  echo "Open http://127.0.0.1:5173/ in a browser."
  echo "Stop the existing terminal with Ctrl+C before starting another copy."
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://127.0.0.1:5173/" >/dev/null 2>&1 || true
  fi
  # This short run must not stop a studio it did not start in a previous terminal.
  if [[ -n "${STUDIO_PID}" ]]; then
    disown "${STUDIO_PID}" 2>/dev/null || true
    STUDIO_PID=""
  fi
  exit 0
fi

echo "Starting Agent Routing Lab from ${ROOT}"
echo "Interface: http://127.0.0.1:5173/"
echo "API:       http://127.0.0.1:8787/"
echo "Press Ctrl+C in this terminal to stop both servers."

if command -v xdg-open >/dev/null 2>&1; then
  (
    for _ in $(seq 1 40); do
      if port_open 5173; then
        xdg-open "http://127.0.0.1:5173/" >/dev/null 2>&1 || true
        exit 0
      fi
      sleep 0.5
    done
  ) &
fi

set +e
npm run dev
code=$?
set -e
exit "$code"
