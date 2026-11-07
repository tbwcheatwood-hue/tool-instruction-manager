# Agent Routing Lab

A local visual workspace for connecting agents, tools, branches, and a reviewer, then running the graph.

This is a working prototype. The status section at the bottom says what was executed, what is simulated, and what is not built.

## Requirements

Node.js 20 or newer. The snap Node 10 on this machine cannot run the app. If Node 22 is installed under `~/.local/node`, put it first:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
node -v
```

## Run

```bash
npm install
npm test
npm run dev
```

Open http://127.0.0.1:5173. The API listens on http://127.0.0.1:8787. `npm run build && npm start` serves the built UI from the API process.

## Use the canvas

The palette adds or drops nodes. Connect handles to pass results along. Branch nodes have separate **pass** and **fail** handles. Select a node to edit it.

Load **Pass example**, **Reject example**, or **Branch example**, then choose **Run workflow**. The bottom panel shows tool calls, model responses, review verdicts, artifacts, and earlier runs.

**Save** writes the graph to `data/workflows`. **Export** downloads the current graph as JSON. **Import** stores a JSON workflow and opens it. Saved workflows do not contain provider API keys.

## Providers

The built-in **Simulated** provider is labeled in the run log and does not call a model. Add an OpenAI-compatible endpoint with a base URL such as `https://api.openai.com/v1` or `http://127.0.0.1:11434/v1`, a model id, and an optional API key. Keys stay in `data/providers.json` on this machine. **Test** sends a one-word prompt to that endpoint. A failed test means the endpoint was not reachable. It does not fall back to the simulated provider.

## Status

Verified by `npm test` and by running the UI against the local API:

| Feature | State |
| --- | --- |
| Drag-and-drop canvas, node configuration, import/export, save/load | Genuine UI backed by the shared workflow JSON |
| Sequential and parallel execution, branch skipping, result passing | Genuine engine, covered by tests |
| Local tools and artifact writing | Genuine |
| Reviewer rejects unsupported completion claims | Genuine rule check, not a model |
| OpenAI-compatible `POST /chat/completions` | Genuine client. Tests use a mock fetch. A live call happens only when you configure and test an endpoint |
| Simulated provider | Simulated on purpose, labeled `[simulated]` and in the run banner |
| Execution log, artifacts, and run history | Genuine |
| Token streaming, loops, multi-user auth, external tools, model-based review | Not implemented |
