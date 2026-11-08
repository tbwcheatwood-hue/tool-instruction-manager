import { useEffect, useState } from "react";
import { api, type StudioStatus } from "./api";

export function StudioPanel() {
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [url, setUrl] = useState("http://127.0.0.1:8080/");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    const next = await api.studio();
    setStatus(next);
    setUrl(next.url);
  };

  useEffect(() => {
    void refresh().catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, []);

  const save = async () => {
    setError("");
    setMessage("");
    try {
      const next = await api.saveStudio({ url, token: token.trim() ? token : undefined });
      setStatus(next);
      setToken("");
      setMessage(next.hasToken ? "Studio address saved. The access token is stored on this machine." : "Studio address saved. No access token is stored yet.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  return (
    <div className="studio-layout">
      <aside className="palette">
        <section>
          <h2>Loop Studio</h2>
          <p className={status?.running ? "connection connection-local" : "connection connection-external"}>
            {status?.running ? `Running at ${status.url}` : `Not answering${status ? ` at ${status.url}` : ""}`}
          </p>
          <p className="hint">
            This panel is Autonomous Loop Studio, the PHP app. Autonomous loops, its routing chart, files, shell, and approvals stay in that app. The address must be on this machine.
          </p>
          <label className="field">
            <span>Address</span>
            <input aria-label="Studio address" value={url} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <label className="field">
            <span>Access token</span>
            <input
              aria-label="Studio access token"
              type="password"
              value={token}
              placeholder={status?.hasToken ? "Saved — enter a new token to replace it" : "Paste the token from the first launch"}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <button type="button" className="primary" onClick={() => void save()}>
            Save studio
          </button>
          <button type="button" className="ghost" onClick={() => void refresh().catch((loadError) => setError(String(loadError)))}>
            Check again
          </button>
          {message && <p className="note">{message}</p>}
          {error && <p className="error">{error}</p>}
          {!status?.running && (
            <p className="hint">
              Install PHP, then start the workspace with ./Start.sh. The first launch prints a token. Paste it here and into Config → Access token inside the studio.
            </p>
          )}
        </section>
      </aside>
      <div className="studio-frame-wrap">
        {status?.running ? (
          <iframe className="studio-frame" title="Autonomous Loop Studio" src={status.url} />
        ) : (
          <div className="panel-empty">
            <h2>Studio is not running</h2>
            <p>The workflow canvas and chat still work. Start the PHP app to use loops, tools, and the studio routing chart here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
