# Architecture

Agent Routing Lab is a small local application. The canvas, the execution engine, and the HTTP API share one workflow JSON document.

## Modules

- `src/shared` defines the workflow, provider, artifact, and run types. `parseWorkflow` is the only import path for untrusted JSON.
- `src/engine` executes a workflow. It does not know about Express or React.
- `src/server` stores workflows, providers, and finished runs as JSON files under `data/`, and exposes them over HTTP.
- `src/client` is the canvas. It sends the current graph to `POST /api/runs` and renders the returned events.

## Graph execution

Nodes are `input`, `agent`, `tool`, `branch`, `reviewer`, and `output`. Edges pass a node's output to its successors. A node waits until every predecessor is finished, then runs. Nodes that become ready together run with `Promise.all`, so independent branches are parallel. A chain of edges stays sequential because each step waits for the previous one.

Cycles are rejected before execution. Loops are not implemented.

A branch node activates only the outgoing edge whose `sourceHandle` is `pass` or `fail`. Nodes that lose every incoming edge are skipped, and their own outgoing edges stay inactive. A join still runs when at least one incoming edge is active.

## Agents and providers

An agent node resolves `providerId` against the saved provider list.

- `simulated` returns a labeled draft on the server. It never calls `fetch`. The optional simulated claim is appended so the reviewer can be demonstrated without a model.
- `openai-compatible` sends `POST {baseUrl}/chat/completions` with the configured model, temperature, and bearer token. The base URL is whatever the user saved, including a local server such as `http://127.0.0.1:11434/v1`.

API keys live in `data/providers.json`. Workflow export does not include them, and run events do not copy them.

## Tools, artifacts, and review

Tools are local and deterministic: `echo`, `template`, `json_extract`, `concat`, `delay`, and `write_artifact`. `write_artifact` stores `{ name, content, producedBy }`.

The reviewer reads artifacts produced by its ancestor nodes, not artifacts written by a parallel sibling. It rejects a result when a required artifact is missing or empty, when the text references `artifact:name` that is missing, or when the text claims completion and no upstream artifact exists. Rejection is a node status. Downstream nodes still receive the verdict.

## Runs

`POST /api/runs` starts a run and returns immediately. `GET /api/runs/:id/stream` replays events as server-sent events. The finished run is stored in `data/runs`. The UI also polls the run so the final status does not depend on the stream staying open.

## Smallest useful slice

The first version ships the engine, the six node kinds, both provider kinds, file persistence, import/export, and the canvas. It does not stream model tokens, run cycles, call third-party tools, or use a model as the reviewer.
