#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NAME="${GITHUB_REPO_NAME:-tool-instruction-manager}"
export PATH="${HOME}/.local/bin:${PATH}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install gh first: see docs/GITHUB-PUBLISH.md" >&2
  exit 1
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "Run: gh auth login" >&2
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "Remote origin already exists. Push with: git push -u origin \$(git branch --show-current)" >&2
  exit 1
fi

CURRENT="$(git branch --show-current)"
if [[ "$CURRENT" != "main" ]]; then
  git branch -M main
fi

gh repo create "$NAME" \
  --public \
  --source=. \
  --remote=origin \
  --description "T.I.M. — Tool & Instruction Manager: local agent mesh canvas with Connect + ALS hooks" \
  --push

echo ""
echo "Public repo: https://github.com/$(gh api user -q .login)/${NAME}"
