# T.I.M.

Tool & Instruction Manager. A task iteration mechanism.

**Share / clone:** this repo is the T.I.M. mesh app only. [Autonomous Loop Studio (ALS)](https://github.com/MBHudson/Autonomous) is a separate install your friend downloads and points to from **Connect**. To publish this project on GitHub, see [docs/GITHUB-PUBLISH.md](docs/GITHUB-PUBLISH.md).

T.I.M. is a local canvas for a mesh of agents. Agents, local models, MCP-style tools, and routers are nodes. Flow edges hand work onward. Brain edges attach a model. Tool edges attach a tool. The engine runs the graph and streams tokens, tool status, and hardware metrics back to the canvas.

The interface is black, with lavender for the active path and olive for success and hardware.

## Launch (T.I.M. + ALS)

Node.js 20+ and PHP 7.4+ are required. ALS lives at `~/Downloads/Autonomous-master` unless you change it in Connect.

**One command (recommended):**

```bash
cd /home/livingroom/agent-routing-lab
./Start.sh
```

That starts **Autonomous Loop Studio** on http://127.0.0.1:8080/, the mesh engine on http://127.0.0.1:8791/, and the UI on http://127.0.0.1:3000/.

**Open the app:** **http://127.0.0.1:3000/** — must be `http`, not `https`. If the browser says `ERR_SSL_PROTOCOL_ERROR`, you used https by mistake (see below).

- **MESH** — flow canvas (agents, tools, Run).
- **ALS** — Loop Studio embedded via same-origin proxy (`/als-studio` → port 8080).
- **TAB** (next to MESH | ALS) — opens ALS in a separate browser tab if embed misbehaves.

First visit to ALS may ask for an access token. It is in `~/Downloads/Autonomous-master/storage/config.json` under `sandbox.token`.

If port **8080** is busy (old Desktop copy of the lab), stop that process and run `./Start.sh` again.

**T.I.M. only** (ALS already running elsewhere):

```bash
npm install   # once
npm run dev
```

`npm test` checks routing, ALS provider cleanup, and a scripted mesh run. `npm run typecheck` checks TypeScript.

### `ERR_SSL_PROTOCOL_ERROR` on T.I.M.

T.I.M. and the dev server speak **plain HTTP** on port 3000. ALS on 8080 is the same. There is no TLS certificate.

- Use **http://127.0.0.1:3000/** (type `http://` or pick the bar’s non-https suggestion).
- Do **not** open **https://127.0.0.1:3000** — that produces “invalid response” / `ERR_SSL_PROTOCOL_ERROR`.
- If Chrome “always uses secure connections”, turn that off for this session or use Firefox, or clear HSTS for `127.0.0.1` via `chrome://net-internals/#hsts` (delete domain `127.0.0.1`).
- In Cursor, prefer **Open in Browser** / an external browser with the `http://` link from the terminal after `./Start.sh`.

### ALS chat quirks

| Symptom | What to try |
| --- | --- |
| **Stream cut off** | Use **TAB** instead of the iframe; load the model in LM Studio; send a shorter message; hard-refresh ALS (`Ctrl+Shift+R`). |
| **Blank bubble** | Hard-refresh after Connect → **Clean bogus providers** or **Register**; confirm the agent’s provider endpoint ends with `/v1/chat/completions` (not just `/v1`). |

**Connect** (left rail): scan LAN, set ALS paths, register verified endpoints into `storage/state.json`.

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
