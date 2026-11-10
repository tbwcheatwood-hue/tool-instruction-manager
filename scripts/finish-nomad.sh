#!/usr/bin/env bash
# Finish Project NOMAD after install_nomad.sh left off at "port 8080 in use".
# Requires sudo (Docker daemon access).
set -euo pipefail

NOMAD_DIR="${NOMAD_DIR:-/opt/project-nomad}"
COMPOSE="${NOMAD_DIR}/compose.yml"

if [[ ! -f "$COMPOSE" ]]; then
  echo "NOMAD compose not found at ${COMPOSE}. Run install_nomad.sh from Autonomous-master first." >&2
  exit 1
fi

if ss -ltn 2>/dev/null | grep -q ':8080 '; then
  echo "Port 8080 is still in use. Free 8080 for NOMAD Command Center (T.I.M. uses 8070 via ./Start.sh), then retry." >&2
  ss -ltnp | grep ':8080 ' || true
  exit 1
fi

echo "Starting Project NOMAD (management stack on http://127.0.0.1:8080/) ..."
if docker info >/dev/null 2>&1; then
  docker compose -p project-nomad -f "$COMPOSE" pull
  docker compose -p project-nomad -f "$COMPOSE" up -d
else
  sudo docker compose -p project-nomad -f "$COMPOSE" pull
  sudo docker compose -p project-nomad -f "$COMPOSE" up -d
fi

echo ""
docker compose -p project-nomad -f "$COMPOSE" ps 2>/dev/null || sudo docker compose -p project-nomad -f "$COMPOSE" ps
echo ""
echo "Command Center: http://127.0.0.1:8080/  (LAN: see URL= in ${COMPOSE})"
echo "T.I.M. http://127.0.0.1:8070/ · ALS http://127.0.0.1:8888/ (8090 = NOMAD Kiwix)"
