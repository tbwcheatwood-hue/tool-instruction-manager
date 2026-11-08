# Using Agent Routing Lab

This describes the controls that are in the application. Workflow view has a header, a step list on the left, the canvas in the center, an inspector on the right, and a run panel along the bottom. On a narrow window those areas stack. Chat and Loop Studio replace the canvas until you switch back.

## Workspace

The header switches among three views. The **Active** pill is the connection Chat will use. It says whether that provider is simulated, a local model, or an external service. Click a provider in Workflow or Chat to change it. A `studio_relay` tool uses the provider selected on that tool, which can be the same one.

- **Workflow** is the canvas described below.
- **Chat** sends the conversation to the active provider. **Save provider** adds a name, base URL, model, and optional API key. **Test** checks that provider. Simulated replies start with `[simulated]` and do not call a model. A base URL on `127.0.0.1` or `localhost` is local. Any other host is external, and the message leaves this machine.
- **Loop Studio** shows Autonomous Loop Studio when `./Start.sh` has started the PHP app. Save its loopback address and the access token from the first launch. Autonomous loops, the studio routing chart, files, shell, and approvals are used in that panel. They are not extra buttons on the canvas.

## Header

- **Workflow** renames the graph currently on the canvas.
- **Open** lists workflows already saved in `data/workflows`. Choosing one replaces the canvas.
- **Save** writes the canvas to the API. A new id is stored as a JSON file under `data/workflows`.
- **Export** downloads the current graph as JSON. The file does not contain provider API keys.
- **Import** reads a workflow JSON file, stores it, and opens it.
- **Pass**, **Reject**, and **Branch** load the three built-in examples. They are not saved until you press Save.

## Adding and connecting steps

The left list has six step types. Click one to drop it on the canvas, or drag it onto the canvas.

| Step | What it does |
| --- | --- |
| Input | Receives the text or JSON from the run panel. Every input step gets that same run input. |
| Agent | Builds a prompt from its name, role, system instructions, and the upstream results, then calls the selected provider. |
| Tool | Runs one local tool. `studio_relay` is the exception: it sends upstream text through the PHP studio. |
| Branch | Chooses the **pass** or **fail** handle. Only the matching outgoing connection stays active. The other path is skipped. |
| Reviewer | Compares upstream text with artifacts produced by earlier steps. It does not call a model. |
| Output | Collects the results that reached it along active connections. |

Connect a handle on the right of a step to a handle on the left of the next step. A branch has two right-hand handles, labeled pass and fail. Steps that become ready at the same time run together. A step waits until the steps before it have finished, so a chain stays in order.

Select a step to edit it in the inspector. Press Backspace or Delete while it is selected to remove it.

The canvas controls are zoom in, zoom out, fit view, and lock interaction. The small map in the corner shows the whole graph.

## Agent settings

- **Label** is the name drawn on the canvas.
- **Name** and **Role** are included in the prompt.
- **System instructions** are the agent's instructions.
- **Provider** is Simulated or an OpenAI-compatible endpoint you have saved.
- **Model override** replaces the provider's model for this agent. Leave it blank to use the provider's model.
- **Temperature** is sent with a real endpoint. The default is 0.2.
- **Simulated claim** is extra text added only when the provider is Simulated. A real endpoint returns the model's text instead, and this field is not appended.

A simulated response starts with `[simulated]` and the run panel shows an amber notice that no model endpoint was called.

## Tools

Choose the tool in the inspector. These fields are shown for every tool; each tool uses only the ones that apply.

- **write_artifact** stores text under **Artifact name**. **Template** is the content. `{{input}}` and `{{text}}` are replaced with the upstream text. The artifact is available only to later steps connected downstream, not to a step running beside it.
- **template** returns the template text after the same `{{input}}` / `{{text}}` replacement.
- **concat** joins the text from each incoming connection, using **Separator**.
- **json_extract** reads **JSON path** from the upstream data, such as `upstream.0.output.text`.
- **studio_relay** sends the upstream text through the PHP studio's model relay, using the provider selected on that tool. A simulated provider does not call the studio. If the studio is not running, the step errors. The reply comes back as the tool's text.
- **echo** returns the upstream text unchanged.
- **delay** waits **Delay ms** milliseconds, then passes the upstream text through. The wait is capped at 5 seconds.

## Branch settings

**Mode** is one of:

- **contains**: pass when the upstream text includes **Value**
- **equals**: pass when the text matches **Value** exactly
- **regex**: pass when **Value** is a regular expression that matches
- **json_truthy**: pass when **Path** points at a value that is present and not empty, false, or zero. With no path, it checks the upstream text.

**Path** is optional for the other modes. When it is set, the comparison uses that field instead of the whole upstream value.

## Reviewer settings

**Required artifacts** is a comma-separated list of artifact names that must already exist and be non-empty.

When **Reject completion claims that have no upstream artifact** is checked, text that says complete, completed, done, or finished is rejected unless an earlier step produced a non-empty artifact.

The reviewer also rejects a claim that mentions `artifact:some-name` when that artifact is missing or empty.

A rejection is a result, not a crash. The review stays in the execution log with the reasons, and later steps still receive it. The run status becomes **rejected**. A missing provider, a bad regular expression, or an HTTP error from a model sets the step to **error** and the run status to **error**.

## Run panel

**Input** is the payload for the input steps. If the text starts with `{` or `[`, it is parsed as JSON. Otherwise it is sent as text.

**Run workflow** executes the canvas. The status pill shows idle, running, ok, rejected, or error.

**Execution** lists each event: step start and finish, tool calls, model responses, artifacts, reviews, and errors. A model response includes `"simulated": true` or `"simulated": false`.

**Artifacts** shows the name and content written during the run.

**History** lists finished runs stored in `data/runs`. Choosing one reloads that run's events, artifacts, and status. It does not change the canvas.

## Providers

The **Simulated** provider is always available. **Test** confirms that it does not call a model.

**Add endpoint** saves an OpenAI-compatible provider:

- **Name** is the label in the agent provider list
- **Base URL** is the API root, such as `http://127.0.0.1:11434/v1` or `https://api.openai.com/v1`. The app calls `{base URL}/chat/completions`.
- **Model** is the model name sent in that request
- **API key** is optional. It is stored in `data/providers.json` on this computer and is not written into an exported workflow

**Test** on a saved endpoint sends a short prompt to that URL. A failure means the endpoint did not answer. The app does not switch that run to the simulated provider.

## How the three parts fit

1. Add a provider in **Chat** or in the workflow's **Add endpoint** form. The Active pill should name that connection.
2. Send a chat message to confirm a simulated, local, or external reply.
3. On the canvas, add a tool, set it to `studio_relay`, choose the same provider, and connect it after an input or another step. Run the workflow. A real provider requires Loop Studio to be running.
4. Open **Loop Studio** for an autonomous loop or the studio's own tools. That behavior is documented in `autonomous/README.md`.

Stopping the lab with Ctrl+C also stops a studio that the same `Start.sh` started.

## Files the app writes

While the servers are running, saves and runs are stored in the `data` folder next to the project:

- `data/workflows/*.json` for saved graphs
- `data/providers.json` for providers, including API keys
- `data/studio.json` for the Loop Studio address and access token
- `data/runs/*.json` for finished runs
