import { useState } from "react";
import { connectionKind, connectionLabel } from "../shared/connection";
import type { ProviderPublic } from "../shared/types";
import { api } from "./api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  connection?: string;
}

export function Chat({
  providers,
  activeId,
  onActive,
  onCreate,
  onTest,
}: {
  providers: ProviderPublic[];
  activeId: string;
  onActive: (id: string) => void;
  onCreate: (form: { name: string; baseUrl: string; model: string; apiKey: string }) => Promise<void>;
  onTest: (id: string) => Promise<void>;
}) {
  const active = providers.find((provider) => provider.id === activeId) ?? providers[0];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState("");
  const [form, setForm] = useState({ name: "Local model", baseUrl: "http://127.0.0.1:11434/v1", model: "", apiKey: "" });

  const send = async () => {
    const content = draft.trim();
    if (!content || !active || sending) return;
    setLocalError("");
    setSending(true);
    const history = [...messages, { role: "user" as const, content }];
    setMessages(history);
    setDraft("");
    try {
      const result = await api.chat(
        active.id,
        history.map((message) => ({ role: message.role, content: message.content })),
      );
      setMessages([...history, { role: "assistant", content: result.text, connection: result.connection }]);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-layout">
      <aside className="palette chat-side">
        <section>
          <h2>Active connection</h2>
          {active && <p className={`connection connection-${connectionKind(active)}`}>{connectionLabel(active)}</p>}
          <div className="provider-list">
            {providers.map((provider) => (
              <article key={provider.id} className={`provider-card ${provider.id === active?.id ? "is-active" : ""}`}>
                <button type="button" className="ghost provider-pick" onClick={() => onActive(provider.id)}>
                  <strong>{provider.name}</strong>
                  <span className="muted">{connectionLabel(provider)}</span>
                </button>
                <button type="button" className="ghost" onClick={() => void onTest(provider.id)}>
                  Test
                </button>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h2>Add a provider</h2>
          <p className="hint">A local base URL stays on this machine. Any other host is an external service. The key is stored in data/providers.json and is not shown again.</p>
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="field">
            <span>Base URL</span>
            <input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />
          </label>
          <label className="field">
            <span>Model</span>
            <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </label>
          <label className="field">
            <span>API key</span>
            <input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} />
          </label>
          <button
            type="button"
            className="primary"
            onClick={() =>
              void onCreate(form).then(() => {
                setForm({ ...form, apiKey: "" });
              })
            }
          >
            Save provider
          </button>
        </section>
      </aside>
      <section className="chat-main">
        <div className="chat-log" aria-live="polite">
          {messages.length === 0 && (
            <p className="hint">Messages go to the active connection. Simulated replies are labeled and do not leave this machine. A local or external provider receives the conversation through the lab API.</p>
          )}
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`bubble bubble-${message.role}`}>
              <span className="kicker">{message.role === "user" ? "You" : "Assistant"}</span>
              <p>{message.content}</p>
            </article>
          ))}
          {localError && <p className="error">{localError}</p>}
        </div>
        <form
          className="chat-compose"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="Message"
            value={draft}
            rows={3}
            placeholder={active ? `Message ${active.name}` : "Add a provider first"}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="primary" disabled={sending || !active}>
            {sending ? "Sending" : "Send"}
          </button>
        </form>
      </section>
    </div>
  );
}
