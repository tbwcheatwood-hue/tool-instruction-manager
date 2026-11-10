#!/usr/bin/env bash
# T.I.M. PHP (default :8070) + ALS on its own port (default :8888), mesh engine on loopback :8791.
# NOMAD: 8080 Command Center, 8090 Kiwix.
# 8080 is left free for NOMAD.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

export TIM_ROOT="$ROOT"
export TIM_HTTP_PORT="${TIM_HTTP_PORT:-8070}"
export TIM_ENGINE_PORT="${TIM_ENGINE_PORT:-8791}"
export TIM_HTTP_URL="http://127.0.0.1:${TIM_HTTP_PORT}"
export ALS_HTTP_PORT="${ALS_HTTP_PORT:-8888}"
export ALS_API_URL="${ALS_API_URL:-http://127.0.0.1:${ALS_HTTP_PORT}}"
export ALS_ROOT="${ALS_ROOT:-$HOME/Downloads/Autonomous-master}"
export ALS_HOST="${ALS_HOST:-127.0.0.1}"

ALS_BG_PID=""

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
  if [[ -x "$HOME/.local/node/bin/node" ]]; then
    candidates+=("$HOME/.local/node/bin/node")
  fi
  if command -v node >/dev/null 2>&1; then
    candidates+=("$(command -v node)")
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
    ss -ltn | grep -qE ":${port}\b" && return 0
    return 1
  fi
  (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

start_als_server() {
  local port="$1"
  if port_open "$port"; then
    echo "Loop Studio already on http://127.0.0.1:${port}/"
    return 0
  fi
  local -a php_args=()
  if [[ -f "$ALS_ROOT/storage/php-runtime.ini" ]]; then
    php_args=(-c "$ALS_ROOT/storage/php-runtime.ini")
  fi
  local chosen=""
  chosen="$(cd "$ALS_ROOT" && php "${php_args[@]}" serve.php --free-port "$port" 2>/dev/null)" || chosen="$port"
  export PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-8}"
  echo "Starting Loop Studio on http://127.0.0.1:${chosen}/ ..."
  (
    cd "$ALS_ROOT" || exit 1
    exec php "${php_args[@]}" -S "127.0.0.1:${chosen}" serve.php
  ) >>"$ROOT/data/als-php.log" 2>&1 &
  ALS_BG_PID=$!
  local waited=0
  while ! port_open "$chosen" && (( waited < 40 )); do
    sleep 0.25
    waited=$((waited + 1))
  done
  port_open "$chosen" || die "Loop Studio failed to bind 127.0.0.1:${chosen} (see data/als-php.log)"
  export ALS_HTTP_PORT="$chosen"
  export ALS_API_URL="http://127.0.0.1:${chosen}"
}

NODE="$(pick_node)" || die "Node.js 20+ is required (set NODE_BIN if needed)."
export PATH="$(dirname "$NODE"):$PATH"
command -v npm >/dev/null 2>&1 || die "npm was not found next to ${NODE}."
command -v php >/dev/null 2>&1 || die "php is required."

[[ -d "$ALS_ROOT" ]] || die "ALS_ROOT not found: ${ALS_ROOT}"

if [[ ! -d node_modules/next || ! -d node_modules/tsx ]]; then
  echo "Installing npm dependencies..."
  npm install
fi

if [[ ! -f out/index.html ]] || [[ "${FORCE_BUILD:-0}" == "1" ]]; then
  echo "Building consolidated static UI (out/)..."
  npm run build:consolidated
fi

php "$ROOT/php/Serve.php" --check || die "Unified server check failed."

PHPINI=""
if [[ -f "$ALS_ROOT/storage/php-runtime.ini" ]]; then
  PHPINI="$ALS_ROOT/storage/php-runtime.ini"
fi

mkdir -p "$ROOT/data" "$ROOT/data/workspace"
if [[ ! -f "$ROOT/data/.tim-local-token" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24 >"$ROOT/data/.tim-local-token"
  else
    php -r 'file_put_contents($argv[1], bin2hex(random_bytes(24)));' "$ROOT/data/.tim-local-token"
  fi
  chmod 600 "$ROOT/data/.tim-local-token" 2>/dev/null || true
fi

start_als_server "$ALS_HTTP_PORT"

ENGINE_PID=""
if port_open "$TIM_ENGINE_PORT"; then
  echo "Mesh engine already on 127.0.0.1:${TIM_ENGINE_PORT}"
else
  echo "Starting mesh engine on 127.0.0.1:${TIM_ENGINE_PORT} ..."
  TIM_PORT="$TIM_ENGINE_PORT" ALS_ROOT="$ALS_ROOT" TIM_HTTP_URL="$TIM_HTTP_URL" ALS_API_URL="$ALS_API_URL" \
    "$NODE" "$ROOT/node_modules/tsx/dist/cli.mjs" "$ROOT/engine/index.ts" >>"$ROOT/data/engine.log" 2>&1 &
  ENGINE_PID=$!
  sleep 0.6
  port_open "$TIM_ENGINE_PORT" || die "Mesh engine failed to bind 127.0.0.1:${TIM_ENGINE_PORT} (see data/engine.log)"
fi

if port_open "$TIM_HTTP_PORT"; then
  [[ -n "$ENGINE_PID" ]] && kill "$ENGINE_PID" 2>/dev/null || true
  die "Port ${TIM_HTTP_PORT} is already in use."
fi

cleanup() {
  if [[ -n "$ENGINE_PID" ]]; then
    kill "$ENGINE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting T.I.M. on http://${ALS_HOST}:${TIM_HTTP_PORT}/ ..."
echo ""
echo "Open in browser (HTTP only — not https):"
echo "  T.I.M.         http://${ALS_HOST}:${TIM_HTTP_PORT}/"
echo "  Loop Studio    ${ALS_API_URL}/"
echo ""
echo "Mesh WebSocket (loopback only): ws://127.0.0.1:${TIM_ENGINE_PORT}/ws"
echo "Local tool API: GET http://${ALS_HOST}:${TIM_HTTP_PORT}/tim/tools (header X-Tim-Token from data/.tim-local-token when set)"
echo ""

export TIM_ROOT ALS_ROOT TIM_HTTP_PORT TIM_ENGINE_PORT
if [[ -n "$PHPINI" ]]; then
  exec php -c "$PHPINI" -S "${ALS_HOST}:${TIM_HTTP_PORT}" -t "$ROOT" "$ROOT/php/Serve.php"
else
  exec php -S "${ALS_HOST}:${TIM_HTTP_PORT}" -t "$ROOT" "$ROOT/php/Serve.php"
fi
