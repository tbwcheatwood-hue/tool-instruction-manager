# Agent Routing Lab

A local visual workspace for connecting agents, tools, branches, and a reviewer, then running the graph. Day-to-day use of the canvas is in [USER-GUIDE.md](USER-GUIDE.md).

The app is a Node.js project. In development it runs two processes: a Vite page on port 5173 and an API on port 8787. `npm run dev` starts both.

## Prerequisites

- Ubuntu with a terminal and a web browser
- Node.js 20 or newer, including npm (`node -v`)
- Network access the first time, so `npm install` can download packages

Ubuntu's default `node` may be too old. If `~/.local/node/bin/node` exists and is version 20 or newer, `Start.sh` uses it. Otherwise install a current Node.js and open a new terminal.

## First-time setup

From this folder:

```bash
chmod +x Start.sh
./Start.sh
```

The script installs dependencies when `node_modules` is missing, then starts the app and opens http://127.0.0.1:5173/ when a browser launcher is available.

You can also install by hand:

```bash
npm install
npm run dev
```

## Start

```bash
./Start.sh
```

Or use the desktop shortcut after the install steps at the bottom of this file.

`Start.sh` also starts **Autonomous Loop Studio**, the PHP app in `autonomous/`, when `php` is on PATH. That is [MBHudson/Autonomous](https://github.com/MBHudson/Autonomous), copied in from the local `Autonomous-master` folder. Its own instructions are `autonomous/README.md`. The studio page is printed at startup, usually http://127.0.0.1:8080/. The lab page stays on http://127.0.0.1:5173/.

## One workspace

The lab header has three views. They share the same provider list.

| View | What it is |
| --- | --- |
| Workflow | The existing canvas. A tool set to `studio_relay` sends upstream text through the PHP studio's model relay. |
| Chat | A conversation with the provider marked **Active**. A local base URL stays on this machine. Any other host is an external service. |
| Loop Studio | The PHP app embedded in the page when it is answering. Autonomous loops, the studio's own routing chart, files, and approvals stay there. |

Save the studio address and access token in the Loop Studio view. The address must be `127.0.0.1` or `localhost`. The token is written to `data/studio.json` and is not returned by the API.

Assumption: chat calls an OpenAI-compatible `/chat/completions` endpoint directly. Only the workflow tool `studio_relay` goes through the PHP relay, and only for a non-simulated provider. The PHP app is not rewritten into the lab.

The studio needs PHP with curl:

```bash
sudo apt install php-cli php-curl php-mbstring php-zip
```

If PHP is missing, the routing lab still starts and the script says so. The first studio launch prints an access token. Paste it into **Config → Access token** in the studio. Ctrl+C in the `Start.sh` terminal stops the lab and the studio it started.

## Stop

Click the terminal window that is running the app and press Ctrl+C. Closing that terminal also stops it. If a previous copy is still running, `Start.sh` will not start a second one.

## Desktop shortcut

`agent-routing-lab.desktop` points at this folder:

- command: `/home/livingroom/agent-routing-lab/Start.sh`
- working directory: `/home/livingroom/agent-routing-lab`

If you move the project, edit those two lines so they match the new location. The shortcut opens a terminal so you can read errors and press Ctrl+C to stop.

Install it for your user:

```bash
chmod +x "/home/livingroom/agent-routing-lab/Start.sh"
mkdir -p "$HOME/.local/share/applications" "$HOME/Desktop"
cp "/home/livingroom/agent-routing-lab/agent-routing-lab.desktop" "$HOME/.local/share/applications/"
cp "/home/livingroom/agent-routing-lab/agent-routing-lab.desktop" "$HOME/Desktop/"
chmod +x "$HOME/.local/share/applications/agent-routing-lab.desktop" "$HOME/Desktop/agent-routing-lab.desktop"
gio set "$HOME/Desktop/agent-routing-lab.desktop" metadata::trusted true
update-desktop-database "$HOME/.local/share/applications" || true
```

`gio` is part of a normal Ubuntu desktop. If the Desktop icon still will not start, right-click it and choose Allow Launching.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `Node.js 20 or newer is required` | Install Node 20+ or put a newer `node` first on `PATH`, then run `./Start.sh` again. |
| `npm was not found` | Reinstall Node.js from a build that includes npm. |
| `npm install failed` | Read the npm error. You need a network connection the first time. |
| `already appears to be running` | Open http://127.0.0.1:5173/. Stop the old terminal with Ctrl+C if that page is stale. |
| The page loads but the canvas stays empty or API calls fail | The UI expects the API on port 8787. Start with `./Start.sh` or `npm run dev`, not by opening `index.html` as a file. |
| **Loop Studio** says it is not answering | Install PHP (the command above) and run `./Start.sh` again. The studio log is `data/autonomous.log`. Paste the first-run token into the Loop Studio view. |
| Chat says the provider has no model or the endpoint failed | Open the provider, set a model id, and use **Test**. A local URL such as `http://127.0.0.1:11434/v1` needs that program running. An external URL sends the prompt off this machine. |

## Security

- The lab and the studio listen on this machine only. Do not expose port 5173, 8787, or 8080 to the network.
- Provider API keys live in `data/providers.json`. The studio token lives in `data/studio.json`. Neither is included in a workflow export.
- The studio address is rejected unless it is loopback. The lab will not send a token or an API key to another host on your behalf through the studio relay.
- Chat with an external provider sends the conversation to that host. The active pill names the host before you send.
- Shell, files, and program launch stay inside Autonomous Loop Studio, behind its own access token and approval checks. The lab does not add a second way to run those tools.
- The studio panel is a separate origin inside the page, so the lab page cannot read the studio's stored token.
| Port already in use after a crash | Close the old process, or run `ss -ltnp | grep -E '5173|8787'` and stop the listed process. |

`npm test` runs the engine and API tests. `npm run build && npm start` builds the page and serves it from the API process only. The usual way to work on the app is `./Start.sh`.

## What is real

| Feature | State |
| --- | --- |
| Canvas, node settings, import/export, save/load | Working local UI |
| Sequential and parallel execution, branches, local tools, artifacts, run history | Working |
| Reviewer | Working rule check, not a model |
| OpenAI-compatible `POST /chat/completions` | Real client. A live call happens only after you save an endpoint and run or test it |
| Simulated provider | Labeled `[simulated]` and in the run banner |
| Token streaming, loops, logins, external tools, a model acting as the reviewer | Not built |
