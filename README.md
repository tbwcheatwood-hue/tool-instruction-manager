# T.I.M.

Tool & Instruction Manager. A task iteration mechanism.

**Share / clone:** this repo is the T.I.M. mesh app only. [Autonomous Loop Studio (ALS)](https://github.com/MBHudson/Autonomous) is a separate install your friend downloads and points to from **Connect**. To publish this project on GitHub, see [docs/GITHUB-PUBLISH.md](docs/GITHUB-PUBLISH.md).

T.I.M. is a local canvas for a mesh of agents. Agents, local models, MCP-style tools, and routers are nodes. Flow edges hand work onward. Brain edges attach a model. Tool edges attach a tool. The engine runs the graph and streams tokens, tool status, and hardware metrics back to the canvas.

The interface is black, with lavender for the active path and olive for success and hardware.

## Launch (unified T.I.M. + ALS)

**Requirements:** Node.js 20+ (build + internal mesh engine), PHP 7.4+ with `curl`, and [Autonomous Loop Studio](https://github.com/MBHudson/Autonomous) on disk (`ALS_ROOT`, default `~/Downloads/Autonomous-master`).

### One command (recommended)

```bash
cd agent-routing-lab
./Start.sh
```

This builds the static UI into `out/` (when missing), starts the **mesh engine** on loopback only, and serves everything from **one PHP process**:

| Port | Exposed? | Role |
|------|----------|------|
| **8070** (`TIM_HTTP_PORT`) | **Yes** — open this in the browser | T.I.M. UI, `/tim/*` REST proxy, `/tim/tools` (ALS is separate on **8888**) |
| **8888** (`ALS_HTTP_PORT`) | **Yes** — Loop Studio | ALS `serve.php` from `ALS_ROOT` (started by `Start.sh` unless already running) |
| **8791** (`TIM_ENGINE_PORT`) | Loopback only | Node mesh + WebSocket `/ws` (streaming runs, workflow import) |
| **3000** | Not used in unified mode | Dev-only (`npm run dev`) |

**Open:** **http://127.0.0.1:8070/** — must be `http`, not `https`. With [Project NOMAD](https://www.projectnomad.us/) on the same machine, reserve **8080** (Command Center) and **8090** (Kiwix).

- **MESH** — canvas; HTTP calls go to `/tim/...` on the same host; WebSocket uses `ws://127.0.0.1:8791/ws` (documented exception until SSE migration).
- **ALS** — default **http://127.0.0.1:8888/** (embedded in the ALS tab via iframe; optional same-origin proxy at `/als-studio` if `alsApiUrl` matches T.I.M.’s port).

First visit to ALS may ask for an access token (`storage/config.json` under your `ALS_ROOT`).

**Build the static UI manually:**

```bash
npm run build:consolidated
```

**Developer mode** (separate Next dev server + engine, hot reload):

```bash
npm install   # once
npm run dev
```

Then open http://127.0.0.1:3000/ with ALS at `ALS_API_URL` (default **8888**) or run `./Start.sh` to launch both.

### Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `ALS_ROOT` | `~/Downloads/Autonomous-master` | ALS install path |
| `TIM_HTTP_PORT` | `8070` | T.I.M. PHP listen port |
| `ALS_HTTP_PORT` | `8888` | Loop Studio listen port (`Start.sh` spawns ALS when free) |
| `ALS_API_URL` | `http://127.0.0.1:8888` | Connect / engine default for ALS API |
| `TIM_ENGINE_PORT` | `8791` | Loopback Node mesh port |
| `TIM_WORKSPACE` | `data/workspace` | Jail for PHP local tools |
| `FORCE_BUILD` | `0` | Set to `1` to rebuild `out/` on start |
| `NODE_BIN` | (auto) | Node 20+ binary |

`npm test` — mesh logic, ALS provider cleanup, workflow parsers.  
`php tests/php/run.php` — unified router + PHP tool registry tests.

### Local tool API (PHP)

Discover and invoke allowlisted workspace tools (no arbitrary shell):

- `GET /tim/tools` — registry
- `POST /tim/tools/{id}/invoke` — body JSON args

When `data/.tim-local-token` exists, send header `X-Tim-Token` with that value. Tools: `workspace_list`, `workspace_read`, `echo`.

### Architecture note

PHP does **not** replace the mesh engine or WebSocket layer. It consolidates the **browser entrypoint** and ALS co-hosting. Workflow import and LM Studio streaming during mesh runs remain on the internal Node process.

### `ERR_SSL_PROTOCOL_ERROR`

Use **http://** only. There is no TLS on the local servers.

### ALS chat quirks

| Symptom | What to try |
| --- | --- |
| **Stream cut off** | Use **TAB** instead of the iframe; load the model in LM Studio; send a shorter message; hard-refresh ALS (`Ctrl+Shift+R`). |
| **Blank bubble** | Hard-refresh after Connect → **Clean bogus providers** or **Register**; confirm the agent’s provider endpoint ends with `/v1/chat/completions` (not just `/v1`). |

**Connect** (left rail): scan LAN, set ALS paths, register verified endpoints into `storage/state.json`.

**Import workflows** from Langflow, Flowise, or n8n (file upload or public GitHub search): see [docs/WORKFLOW-IMPORT.md](docs/WORKFLOW-IMPORT.md).

**ALS routing charts:** export the mesh with **→ ALS** or import pipelines under **Import → ALS charts** — see [docs/TIM-ALS-ROUTING.md](docs/TIM-ALS-ROUTING.md).

## LM Studio

Start LM Studio’s local server at `http://127.0.0.1:1234`. The Models panel lists what that server reports, plus `.gguf` files under `~/.lmstudio/models`, `~/.cache/lm-studio/models`, and any directory you set.

Load uses `lms load --gpu <fraction> --context-length <n>` when the `lms` CLI is on `PATH`. Otherwise it calls `POST /api/v1/models/load`. LM Studio’s REST loader does not take a layer count. The GPU slider is a percent of layers: `0` is off, `100` is max, and the REST fallback turns KV-cache GPU offload on whenever the value is above zero. CPU threads are sent with the REST load and stored on the node. The documented CLI loader does not accept a thread flag, so a CLI load keeps LM Studio’s own thread default.

Inference goes to `POST /v1/chat/completions` with temperature, top P, top K, and repeat penalty. Tokens per second and time to first token are measured from the stream. RAM comes from the operating system. VRAM and GPU utilization come from `nvidia-smi` when it is installed.

If you set `LM_API_TOKEN`, it is sent as a bearer token and is not written to the database.

## Tools

Tools run on this machine, inside the workspace shown in the Models panel. The default workspace is `data/workspace`.

| Tool | What it does |
| --- | --- |
| Filesystem | List, read, and write inside the workspace. Paths that leave the workspace are rejected. |
| Workspace info | Reports workspace path, file count, and bytes. |
| Bash | Runs under `/bin/bash` in the workspace after you approve the command. |
| Git | `status`, `log`, or `diff` in the workspace. |
| SQLite query | A single `SELECT` over the mesh memory database. |
| Agent memory | Recent rows from the memories table. |
| Web search | A DuckDuckGo instant answer (network). |
| HTTP fetch | GET an http or https URL after approval (network, size-capped). |
| MCP bridge | POST tool calls to an MCP bridge URL you set in Models (setup required). |

Bash defaults to requiring approval. Agents can also pause for a human note. Memory for agents that have Remember turned on is stored in `data/tim.sqlite`.

## Canvas

Drag a node from the left, or click it to drop one on the canvas. Connect the top handle of an agent to a local LLM for its brain, and the bottom handle to a tool. Flow moves from the right handle to the next node’s left handle. A router sends the message through the first outgoing handle whose match text appears in the upstream message. The remaining handle is the fallback.

Save stores the graph. Run streams the active edge in lavender.
