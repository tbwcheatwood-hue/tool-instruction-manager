# Asclepius

Public repository for **T.I.M.** (Tool & Instruction Manager), a local canvas for a mesh of agents.

Copyright © 2026 Timothy Cheatwood. All rights reserved.

This repository does not include a `LICENSE` file. The copyright notice does not grant permission to copy, modify, or redistribute the code.

T.I.M. is the application in this repository. Agents, local models, MCP-style tools, and routers are nodes. Flow edges hand work onward. Brain edges attach a model. Tool edges attach a tool. The engine runs the graph and streams tokens, tool status, and hardware metrics back to the canvas.

The interface is black, with lavender for the active path and olive for success and hardware.

[Autonomous Loop Studio (ALS)](https://github.com/MBHudson/Autonomous) is a separate program. It is not included here. LM Studio and Ollama are separate as well.

## What you need

- Node.js 20 or newer (the mesh engine and the static UI build)
- PHP 7.4 or newer, with the `curl` extension
- A browser
- Optional: [Autonomous Loop Studio](https://github.com/MBHudson/Autonomous) on disk if you use the ALS tab or ALS routing charts
- Optional: LM Studio’s local server, or another OpenAI-compatible server, if a node needs a model

## 1. Clone and install

```bash
git clone https://github.com/tbwcheatwood-hue/Asclepius.git
cd Asclepius
npm install
```

`npm install` is required. `node_modules` is not in git.

## 2. Start T.I.M.

From the project directory:

```bash
./Start.sh
```

`Start.sh` builds the static UI into `out/` when that folder is missing, starts the mesh engine on loopback, and serves the browser from one PHP process. If ALS is installed at `ALS_ROOT` and port 8888 is free, it also starts Loop Studio.

Open **http://127.0.0.1:8070/** in the browser. Use `http`, not `https`. There is no TLS on these local servers. `https://` produces `ERR_SSL_PROTOCOL_ERROR`.

| Port | Who can reach it | What it is |
|------|------------------|------------|
| **8070** (`TIM_HTTP_PORT`) | This computer’s browser | T.I.M. UI, `/tim/*` REST proxy, `/tim/tools` |
| **8888** (`ALS_HTTP_PORT`) | This computer’s browser | Loop Studio, if `Start.sh` started it |
| **8791** (`TIM_ENGINE_PORT`) | Loopback only | Node mesh and WebSocket `/ws` |
| **3000** | Dev only | `npm run dev` and `npm start`. Not the address `Start.sh` opens |

If Project NOMAD is on the same machine, leave **8080** for its Command Center and **8090** for Kiwix. `Start.sh` does not take 8080.

Rebuild the static UI on the next start:

```bash
FORCE_BUILD=1 ./Start.sh
```

Or build it yourself:

```bash
npm run build:consolidated
```

## 3. Use the canvas

1. Open **http://127.0.0.1:8070/** and choose **MESH**.
2. Drag a node from the left, or click a node to drop it on the canvas.
3. Connect the top handle of an agent to a local LLM. That edge is the brain.
4. Connect the bottom handle to a tool.
5. Connect the right handle to the next node’s left handle. That edge is flow.
6. A router sends the message through the first outgoing handle whose match text appears in the upstream message. The remaining handle is the fallback.
7. Save stores the graph.
8. Run streams the active edge in lavender.

HTTP calls from the page go to `/tim/...` on the same host. The run stream uses `ws://127.0.0.1:8791/ws`.

## 4. Point a node at LM Studio

1. Start LM Studio’s local server at `http://127.0.0.1:1234`.
2. In T.I.M., open the Models panel. It lists what that server reports, plus `.gguf` files under `~/.lmstudio/models`, `~/.cache/lm-studio/models`, and any directory you set.
3. Load a model. If the `lms` command is on `PATH`, T.I.M. runs `lms load --gpu <fraction> --context-length <n>`. Otherwise it calls `POST /api/v1/models/load`.
4. The GPU slider is a percent of layers: `0` is off, `100` is max. LM Studio’s REST loader does not take a layer count. The REST fallback turns KV-cache GPU offload on when the value is above zero. CPU threads are sent with the REST load and stored on the node. The documented CLI loader does not accept a thread flag, so a CLI load keeps LM Studio’s own thread default.
5. Inference goes to `POST /v1/chat/completions` with temperature, top P, top K, and repeat penalty.

Tokens per second and time to first token are measured from the stream. RAM comes from the operating system. VRAM and GPU utilization come from `nvidia-smi` when it is installed.

If you set `LM_API_TOKEN`, it is sent as a bearer token and is not written to the database.

## 5. Run a tool

Tools run on this machine, inside the workspace shown in the Models panel. The default workspace is `data/workspace`. Paths that leave the workspace are rejected.

| Tool | What it does |
| --- | --- |
| Filesystem | List, read, and write inside the workspace |
| Workspace info | Reports workspace path, file count, and bytes |
| Bash | Runs under `/bin/bash` in the workspace after you approve the command |
| Git | `status`, `log`, or `diff` in the workspace |
| SQLite query | A single `SELECT` over the mesh memory database |
| Agent memory | Recent rows from the memories table |
| Web search | A DuckDuckGo instant answer (needs network) |
| HTTP fetch | GET an http or https URL after approval (needs network, size-capped) |
| MCP bridge | POST tool calls to an MCP bridge URL you set in Models |

Bash defaults to requiring approval. Agents can also pause for a human note. Memory for agents that have Remember turned on is stored in `data/tim.sqlite`.

PHP also exposes an allowlisted tool API. It does not run an arbitrary shell.

- `GET /tim/tools` lists the registry
- `POST /tim/tools/{id}/invoke` runs one tool with a JSON body

The PHP tools are `workspace_list`, `workspace_read`, and `echo`. When `data/.tim-local-token` exists, send header `X-Tim-Token` with that value. `Start.sh` creates that file if it is missing.

## 6. Connect Autonomous Loop Studio

Skip this section if you are not using ALS.

1. Install ALS yourself from [github.com/MBHudson/Autonomous](https://github.com/MBHudson/Autonomous).
2. Put it at `~/Downloads/Autonomous-master`, or set `ALS_ROOT` to the real folder before `./Start.sh`.
3. Open **http://127.0.0.1:8888/** or the **ALS** tab in T.I.M.
4. The first ALS visit may ask for an access token. That token stays in `storage/config.json` under your ALS install. It is not part of this repository.
5. In T.I.M., open **Connect** in the left rail. Set the ALS root and API URL (default `http://127.0.0.1:8888`).
6. Scan LAN if you need a model on another machine, then register verified endpoints. Registration writes providers into ALS `storage/state.json`.

ALS chat notes from this project:

| Symptom | What to try |
| --- | --- |
| Stream cut off | Use the ALS tab instead of a stale iframe, load the model in LM Studio, send a shorter message, or hard-refresh ALS (`Ctrl+Shift+R`) |
| Blank bubble | Hard-refresh after Connect → **Clean bogus providers** or **Register**. Confirm the agent’s provider endpoint ends with `/v1/chat/completions`, not only `/v1` |

To move a mesh into an ALS routing chart, or the other way:

1. Build or open a mesh whose **agent** nodes are linked by **flow** edges.
2. Click **→ ALS**, review the summary, then **Push to ALS**.
3. In ALS, open **Routing chart** and select the workflow. The name matches the T.I.M. flow.

The other direction is **Import → ALS charts**. The bridge copies structure. It does not guarantee the same runtime behavior. Router rules, live brain/tool execution, and `llm` / `tool` nodes are not preserved as chart nodes. Details: [docs/TIM-ALS-ROUTING.md](docs/TIM-ALS-ROUTING.md).

## 7. Import a workflow

1. Open **Import** in the top bar.
2. On the **File** tab, choose a `.json` export from Langflow, Flowise, or n8n.
3. Read the conversion summary (ok, warning, or unsupported).
4. Choose **Load on canvas**.
5. Wire **brain** and **tool** edges yourself, and edit prompts. Those edges are not inferred.

Credentials in the source file are not imported. The **Discover** tab searches public GitHub repositories for starter JSON. It does not search the Langflow, Flowise, or n8n hosted catalogs. Set `GITHUB_TOKEN` in the environment before starting the engine if you need a higher GitHub API rate limit. Remote downloads only use allowlisted `raw.githubusercontent.com` URLs returned by search.

Details: [docs/WORKFLOW-IMPORT.md](docs/WORKFLOW-IMPORT.md).

## 8. Developer mode and tests

Hot reload uses a separate Next server. It is not a substitute for `./Start.sh`.

```bash
npm run dev
```

That listens on **http://127.0.0.1:3000/**. `npm start` serves a production build on the same port.

```bash
npm test
php tests/php/run.php
```

`npm test` covers mesh logic, ALS provider cleanup and provider status, desktop notification backend selection, and workflow parsers. The PHP script covers the unified router and the PHP tool registry.

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `ALS_ROOT` | `~/Downloads/Autonomous-master` | ALS install path |
| `TIM_HTTP_PORT` | `8070` | T.I.M. PHP listen port |
| `ALS_HTTP_PORT` | `8888` | Loop Studio listen port |
| `ALS_API_URL` | `http://127.0.0.1:8888` | Connect / engine default for the ALS API |
| `TIM_ENGINE_PORT` | `8791` | Loopback Node mesh port |
| `TIM_WORKSPACE` | `data/workspace` | Jail for PHP local tools |
| `FORCE_BUILD` | `0` | Set to `1` to rebuild `out/` on start |
| `NODE_BIN` | (auto) | Node 20+ binary |
| `LM_API_TOKEN` | empty | Bearer token for LM Studio. Not stored in the database |
| `GITHUB_TOKEN` | empty | Optional GitHub API token for workflow search rate limits |

## Not in this repository

- `node_modules` (run `npm install`)
- `data/*.sqlite` and `data/.tim-local-token` (created on your machine)
- `.env` files and API keys
- ALS, including `storage/config.json`
- The personal assistant that can be run from a separate `assistant/` directory on a development machine. That directory is not part of this public tree.

PHP does not replace the mesh engine or the WebSocket layer. It is the browser entrypoint and the ALS co-host. Workflow import and LM Studio streaming during mesh runs stay on the internal Node process.
