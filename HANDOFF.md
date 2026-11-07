# Handoff: Agent Routing Lab

Continue this project. The previous session only created the folder and installed a usable Node.js. Nothing in the application has been designed or implemented yet.

## Goal

Build a functional prototype of a visual multi-agent AI orchestration platform called "Agent Routing Lab."

This is a genuine software engineering project, not a landing page, static mockup, or presentation.

The application must provide:

1. A drag-and-drop visual workflow canvas where users connect AI agents, tools, branching logic, and execution steps.
2. Configurable agents with names, roles, system instructions, model selection, and provider settings.
3. Sequential and parallel workflow execution, with results passed between connected nodes.
4. Support for OpenAI-compatible model endpoints, including user-defined local endpoints.
5. Visible execution monitoring showing tool calls, model responses, errors, artifacts, and execution history.
6. A reviewer node that checks claimed task completion against actual output artifacts and can reject unsupported results.
7. Workflow persistence and JSON import/export.

Build the system with a modular architecture, not a collection of hardcoded demonstrations.

Use simulated models only where needed to demonstrate the interface, and clearly distinguish simulated functionality from genuine integrations.

First produce an architecture and implementation plan. Then implement the smallest usable end-to-end version.

Include functional tests and show which features genuinely work, which are simulated, and which remain unimplemented.

Do not claim the application works unless you have executed and verified it.

Keep the project self-contained and exportable. Do not require access to a private network or any existing codebase.

Prefer functionality over visual polish, but provide a usable visual interface.

## Already done

- Project directory: `/home/livingroom/agent-routing-lab`
- `git init` completed. No commits. Do not commit unless the user explicitly asks.
- Do not change git config.
- No source files, package manifest, or architecture doc existed before this handoff.
- The machine's default `node` on `PATH` is snap Node v10.24.1 and cannot build this app.
- Node.js 22.21.1 is installed at `/home/livingroom/.local/node`. Put that `bin` directory first on `PATH` before `npm install` or running the app:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
node -v   # expect v22.21.1
```

## Constraints

- Self-contained. Do not read or depend on other repositories, private services, or credential files outside this project.
- Simulated providers must be labeled as simulated. OpenAI-compatible HTTP calls are the real integration and must be tested with a mock fetch, not by calling a private network.
- Verify with executed tests. For the UI, exercise the running app; do not claim it works from a screenshot alone.
- Prefer a small TypeScript app (Vite + React canvas, Node execution API, shared engine, vitest). Adjust if a simpler stack still meets the requirements.
