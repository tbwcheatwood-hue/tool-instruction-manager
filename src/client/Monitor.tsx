import type { Artifact, RunEvent, RunStatus } from "../shared/types";
import type { RunSummary } from "./api";

function preview(payload: unknown): string {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return text.length > 280 ? `${text.slice(0, 280)}…` : text;
}

export function Monitor({
  inputText,
  onInput,
  events,
  artifacts,
  status,
  history,
  error,
  note,
  running,
  onRun,
  onSelectHistory,
}: {
  inputText: string;
  onInput: (value: string) => void;
  events: RunEvent[];
  artifacts: Artifact[];
  status: RunStatus | "idle";
  history: RunSummary[];
  error: string;
  note: string;
  running: boolean;
  onRun: () => void;
  onSelectHistory: (id: string) => void;
}) {
  const simulated = events.some((event) => event.kind === "model_response" && Boolean((event.payload as { simulated?: boolean }).simulated));
  const liveModel = events.some((event) => event.kind === "model_response" && (event.payload as { simulated?: boolean }).simulated === false);
  return (
    <section className="monitor">
      <div className="panel run-box">
        <div className="panel-head">
          <h2>Run</h2>
          <span className={`pill run-status-${status}`}>{status}</span>
        </div>
        <label>
          Input
          <textarea value={inputText} onChange={(event) => onInput(event.target.value)} rows={3} />
        </label>
        <button type="button" className="primary run-button" onClick={onRun} disabled={running}>
          {running ? "Running…" : "Run workflow"}
        </button>
        {error && <div className="error">{error}</div>}
        {note && <div className="note">{note}</div>}
        {simulated && <div className="banner simulated">Simulated provider. This response did not come from a model endpoint.</div>}
        {liveModel && <div className="banner live">This run called an OpenAI-compatible endpoint.</div>}
      </div>
      <div className="panel log">
        <div className="panel-head">
          <h2>Execution</h2>
        </div>
        <ol>
          {events.map((event) => (
            <li key={event.seq}>
              <div className="event-line">
                <strong>{event.kind}</strong>
                <span>{event.nodeId}</span>
                {event.status && <em className={`pill run-status-${event.status}`}>{event.status}</em>}
              </div>
              <code>{preview(event.payload)}</code>
            </li>
          ))}
          {events.length === 0 && <li className="muted">Tool calls, model responses, reviews, and errors appear here.</li>}
        </ol>
      </div>
      <div className="panel side-log">
        <div className="panel-head">
          <h2>Artifacts</h2>
        </div>
        {artifacts.length === 0 && <p className="muted">None yet.</p>}
        {artifacts.map((artifact) => (
          <article key={`${artifact.producedBy}-${artifact.name}`}>
            <strong>{artifact.name}</strong>
            <pre>{artifact.content}</pre>
          </article>
        ))}
        <div className="panel-head">
          <h2>History</h2>
        </div>
        <ul className="history">
          {history.map((run) => (
            <li key={run.id}>
              <button type="button" className="ghost" onClick={() => onSelectHistory(run.id)}>
                <span>{run.workflowName}</span>
                <em className={`pill run-status-${run.status}`}>{run.status}</em>
              </button>
            </li>
          ))}
          {history.length === 0 && <li className="muted">No saved runs.</li>}
        </ul>
      </div>
    </section>
  );
}
