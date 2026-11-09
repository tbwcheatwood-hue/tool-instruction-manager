# Workflow import & search

T.I.M. can import agent workflows from **Langflow**, **Flowise**, and **n8n** JSON exports. Conversion is **structural**, not semantic: components become mesh nodes and connections become **flow** edges. LLM/brain and tool edges are **not** inferred automatically.

## Import (UI)

1. **Import** in the top bar → tab **File** → choose a `.json` export.
2. Review the **conversion summary** (ok / warning / unsupported).
3. **Load on canvas** — then wire **brain** and **tool** edges and edit prompts.

Supported sources:

| Platform | Format | Notes |
| --- | --- | --- |
| **Langflow** | Native export (`name`, `data.nodes`, `data.edges`) | Starter projects and UI exports |
| **Flowise** | Chatflow JSON (`nodes` / `edges` or `flowData`) | Best-effort mapping |
| **n8n** | Workflow JSON (`n8n-nodes-base.*`, `connections`) | Credentials & triggers stripped |

Credentials in source files are **not** imported. You’ll see warnings; set keys locally.

## Search (UI)

Tab **Discover** searches **public GitHub repositories** (not live Langflow/Flowise/n8n SaaS catalogs):

| Platform | What is searched |
| --- | --- |
| Langflow | `langflow-ai/langflow` → `starter_projects/*.json` |
| Flowise | `FlowiseAI/FlowiseDocs` JSON templates |
| n8n | `n8n-io/n8n-workflows` community JSON |

Optional: set `GITHUB_TOKEN` in the environment when starting the mesh engine for higher GitHub API rate limits.

Remote downloads only use **allowlisted** `raw.githubusercontent.com` URLs returned by search. Arbitrary URLs are rejected (SSRF protection).

## API (engine)

- `POST /workflows/import` — `{ "text": "<json>", "source": "auto" | "langflow" | "flowise" | "n8n" }`
- `POST /workflows/fetch` — `{ "rawUrl": "<allowlisted raw github url>" }`
- `POST /workflows/search` — `{ "platform": "langflow" | "flowise" | "n8n", "query": "RAG" }`

Import and conversion do **not** run the mesh.

## Limitations

- No claim of behavioral equivalence with source platforms.
- Langflow port handles and conditional logic are simplified to flow edges.
- n8n schedules, webhooks, and credentials are dropped.
- Flowise-specific memory and vector stores are not modeled.

To add a new source, implement `detect*` + `convert*` in `engine/workflow/converters/` and register in `converters/index.ts`.
