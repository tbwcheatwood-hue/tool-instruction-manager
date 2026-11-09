# Setup options — steps 2 and 3 (later)

These steps are **not** implemented in T.I.M. yet. Use Connect when you are ready.

## Step 2 — Remote machines / phone (SSH)

Pick one path when inference runs on another host or a phone on the LAN.

| Option | When to use | What you do |
| --- | --- | --- |
| **A. SSH local forward** | Model API only on the remote loopback | In Connect choose **SSH tunnel**, set SSH host/user, local port (e.g. `11434`), remote `127.0.0.1:11434`. Run the suggested `ssh -N -L ...` or use **Tunnel** in the panel. Point **API base URL** at `http://127.0.0.1:<localPort>/...`. |
| **B. LAN bind on remote** | Ollama/LM Studio bound to `0.0.0.0` on the remote | SSH in only to start the server; in T.I.M. add a **LAN host** profile with the remote LAN IP and discovered port. |
| **C. Phone on Wi‑Fi** | Dev server on the phone | Same as B if the phone exposes a LAN IP; otherwise A with SSH to a jump host or USB debugging bridge (manual). |
| **D. Manual tunnel** | You already run `ssh -L` outside T.I.M. | **Custom** profile with `baseUrl` `http://127.0.0.1:<forwardedPort>/v1`. |

After the API responds from this machine, run **Scan LAN** (if LAN) or test the tunnel URL, then **Register verified endpoints** to merge into ALS.

## Step 3 — Other LAN hosts

| Option | When to use | What you do |
| --- | --- | --- |
| **A. Rescan** | Peer is online with inference running | Wake the box, confirm firewall allows the API port, click **Scan LAN** in Connect, pick the service row, save as LAN profile. |
| **B. Static profile** | You know IP:port already | **LAN host** + **API base URL** without a full scan. |
| **C. Register to ALS** | Providers should appear in Loop Studio | With verified models listed, **Register verified endpoints** (cleanup runs first). In ALS, activate each provider and run a short chat test. |
| **D. No merge** | Read-only test | Use T.I.M. mesh with `baseUrl` on the node only; skip ALS register. |

Step 4 (ALS root + API URL in Connect) stays at the defaults you approved unless you change them deliberately.
