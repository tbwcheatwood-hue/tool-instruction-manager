#!/usr/bin/env bash
# Start T.I.M. + ALS together: Autonomous Loop Studio on 8080, mesh engine 8791, UI 3000.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ALS_ROOT="${ALS_ROOT:-$HOME/Downloads/Autonomous-master}"
ALS_HOST="${ALS_HOST:-127.0.0.1}"
ALS_PORT="${ALS_PORT:-8080}"

die() {
  echo "T.I.M.: $*" >&2
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
    ss -ltn | grep -q ":${port} " && return 0
    return 1
  fi
  (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

als_listen_pid() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | grep ":${ALS_PORT} " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2
  fi
}

als_pid_is_ours() {
  local pid="${1:-}"
  [[ -n "$pid" ]] || return 1
  local args
  args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  [[ "$args" == *"${ALS_ROOT}/serve.php"* || "$args" == *"serve.php"* && "$args" == *"${ALS_ROOT}"* ]]
}

NODE="$(pick_node)" || die "Node.js 20 or newer is required."
export PATH="$(dirname "$NODE"):$PATH"

command -v npm >/dev/null 2>&1 || die "npm was not found next to ${NODE}."
command -v php >/dev/null 2>&1 || die "php is required for ALS (${ALS_ROOT})."

[[ -d "$ALS_ROOT" ]] || die "ALS root not found: ${ALS_ROOT} (set ALS_ROOT if installed elsewhere)."

if [[ ! -d node_modules/next || ! -d node_modules/tsx ]]; then
  echo "Installing dependencies..."
  npm install
fi

if ! php "$ALS_ROOT/serve.php" --check >/dev/null 2>&1; then
  die "ALS check failed in ${ALS_ROOT}. Run: php ${ALS_ROOT}/serve.php --setup"
fi

if ! php "$ALS_ROOT/serve.php" --ensure-token 2>&1 | grep -q '^TOKEN=exists'; then
  token_line="$(php "$ALS_ROOT/serve.php" --ensure-token 2>&1 | grep '^TOKEN=' || true)"
  if [[ "$token_line" == TOKEN=* && "$token_line" != TOKEN=exists ]]; then
    echo "ALS access token was created. When ALS asks for it in the browser, paste the value from:"
    echo "  ${ALS_ROOT}/storage/config.json  (sandbox.token)"
  fi
fi

PHPINI=""
if [[ -f "$ALS_ROOT/storage/php-runtime.ini" ]]; then
  PHPINI="$ALS_ROOT/storage/php-runtime.ini"
fi

export ALS_ROOT

ALS_PID=""
if port_open "$ALS_PORT"; then
  existing_pid="$(als_listen_pid || true)"
  if als_pid_is_ours "$existing_pid"; then
    echo "ALS already listening on ${ALS_HOST}:${ALS_PORT}"
  else
    die "Port ${ALS_PORT} is in use by another process (e.g. old Desktop Agent Routing Lab). Stop it, then run Start.sh again."
  fi
else
  echo "Starting ALS on http://${ALS_HOST}:${ALS_PORT} ..."
  if [[ -n "$PHPINI" ]]; then
    php -c "$PHPINI" -S "${ALS_HOST}:${ALS_PORT}" -t "$ALS_ROOT" "$ALS_ROOT/serve.php" &
  else
    php -S "${ALS_HOST}:${ALS_PORT}" -t "$ALS_ROOT" "$ALS_ROOT/serve.php" &
  fi
  ALS_PID=$!
  sleep 0.4
  if ! port_open "$ALS_PORT"; then
    die "ALS failed to bind ${ALS_HOST}:${ALS_PORT}"
  fi
fi

if port_open 3000 || port_open 8791; then
  [[ -n "$ALS_PID" ]] && kill "$ALS_PID" 2>/dev/null || true
  die "Port 3000 or 8791 is already in use. Stop that process, then run Start.sh again."
fi

cleanup() {
  if [[ -n "$ALS_PID" ]]; then
    kill "$ALS_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

printf '\n'
echo "T.I.M. (HTTP only — do not use https):"
echo "  http://127.0.0.1:3000/"
echo "ALS:"
echo "  http://127.0.0.1:${ALS_PORT}/"
printf '\n'

npm run dev
