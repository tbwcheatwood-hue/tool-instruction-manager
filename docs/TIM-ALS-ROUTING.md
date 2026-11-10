# T.I.M. mesh ↔ ALS routing charts

T.I.M. and **Autonomous Loop Studio (ALS)** use different workflow engines:

- **T.I.M.** mesh: agents, LLMs, tools, routers; runs over WebSocket (`runMesh`).
- **ALS routing chart**: agent orchestration nodes (`parallel`, `merge`, `delay`, …); runs via `chat._callAgent()`.

This bridge converts **structure** between the two. It does **not** guarantee identical runtime behavior.

## Unified server (`./Start.sh`)

| Action | UI | API (proxied as `/tim/*`) |
|--------|-----|---------------------------|
| Export mesh → ALS | MESH toolbar **→ ALS** | `POST /tim/workflows/export-als` `{ push: true }` |
| Import ALS → mesh | Import → **ALS charts** | `POST /tim/workflows/import-als` |
| List ALS pipelines | Import tab | `GET /tim/workflows/als-pipelines` |

Requires **Connect → ALS root** (`alsRoot`) pointing at your ALS install so the engine can read/write `storage/state.json`.

## Export (mesh → routing chart)

1. Build or open a mesh with **agent** nodes linked by **flow** edges.
2. Click **→ ALS**, review the summary, then **Push to ALS**.
3. In ALS, open **Routing chart** and select the workflow (name matches the T.I.M. flow).

What is preserved:

- Agent names, positions, and **flow** topology (with `parallel` / `merge` hops when fan-out/fan-in).
- Brain/tool links are copied into per-node **attachments** (`tim-mesh-context.md`), not as chart nodes.

What is not preserved:

- Live mesh brain/tool execution.
- T.I.M. **router** rules (mapped to `parallel` with warnings).
- `llm` / `tool` nodes (warnings + attachment text).

ALS agents are **matched by name**; missing names are **created** in `state.json` when you push.

## Import (routing chart → mesh)

1. **Import** → **ALS charts** → pick a pipeline → **Preview conversion** → **Load on canvas**.
2. Reconnect **brain** (LLM) and **tool** edges before **Run**.

Structural nodes (`delay`, `loop`, `checkpoint`, `end`) are skipped or warned. Parallel edge modes become flow edges with a note that batch semantics differ.

## From ALS Routing chart (optional)

When ALS is served on the same origin as T.I.M. (unusual; default ALS is `:8888`), the chart toolbar **T.I.M.** button lists saved flows and pushes via the same export API.

## Limitations

- Not a substitute for either runtime.
- Pipelines live in ALS `storage/state.json` (`slots.pipelines`); browser sync may need a moment after push.
- Set `alsRoot` in T.I.M. Connect before using the bridge.
