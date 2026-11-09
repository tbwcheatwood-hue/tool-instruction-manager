# Publish T.I.M. to GitHub (public)

Your project is committed locally. GitHub needs a one-time login on this machine.

## 1. Sign in to GitHub (once)

```bash
export PATH="$HOME/.local/bin:$PATH"
gh auth login
```

Choose: **GitHub.com** → **HTTPS** → **Login with a web browser** → paste the code.

## 2. Create the public repo and push

From the project root:

```bash
cd /home/livingroom/agent-routing-lab
./scripts/publish-github.sh
```

Default repo name: **`tool-instruction-manager`**. Override:

```bash
GITHUB_REPO_NAME=my-tim ./scripts/publish-github.sh
```

## 3. Share with your friend

Send them:

`https://github.com/<your-username>/tool-instruction-manager`

They clone:

```bash
git clone https://github.com/<your-username>/tool-instruction-manager.git
cd tool-instruction-manager
./Start.sh
```

**ALS is not in this repo.** They install [Autonomous Loop Studio](https://github.com/MBHudson/Autonomous) separately and point Connect at that folder (`alsRoot` / `http://127.0.0.1:8080`). LM Studio (or Ollama) is separate too.

## What is not in git

- `node_modules` (run `npm install`)
- `data/*.sqlite` (local mesh DB)
- `.env` / API keys
- ALS `storage/config.json` (access token stays on their machine)
