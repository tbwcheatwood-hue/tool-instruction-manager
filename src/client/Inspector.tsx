import type { Node } from "@xyflow/react";
import type { ProviderPublic } from "../shared/types";
import type { NodeData } from "./flow";

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} /> : <input value={value} onChange={(event) => onChange(event.target.value)} />}
    </label>
  );
}

export function Inspector({
  node,
  providers,
  onChange,
}: {
  node: Node<NodeData> | null;
  providers: ProviderPublic[];
  onChange: (node: Node<NodeData>) => void;
}) {
  if (!node) {
    return (
      <div className="panel-empty">
        <h2>Inspector</h2>
        <p>Select a node to edit its name, instructions, and connections.</p>
      </div>
    );
  }
  const config = node.data.config;
  const setLabel = (label: string) => onChange({ ...node, data: { ...node.data, label } });
  const setConfig = (key: string, value: unknown) => onChange({ ...node, data: { ...node.data, config: { ...config, [key]: value } } });

  return (
    <div className="inspector">
      <h2>{node.data.kind}</h2>
      <Field label="Label" value={node.data.label} onChange={setLabel} />
      {node.data.kind === "agent" && (
        <>
          <Field label="Name" value={String(config.name ?? "")} onChange={(value) => setConfig("name", value)} />
          <Field label="Role" value={String(config.role ?? "")} onChange={(value) => setConfig("role", value)} />
          <Field label="System instructions" value={String(config.systemPrompt ?? "")} onChange={(value) => setConfig("systemPrompt", value)} multiline />
          <label className="field">
            <span>Provider</span>
            <select value={String(config.providerId ?? "simulated")} onChange={(event) => setConfig("providerId", event.target.value)}>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.kind === "simulated" ? "simulated" : "openai-compatible"})
                </option>
              ))}
            </select>
          </label>
          <Field label="Model override" value={String(config.model ?? "")} onChange={(value) => setConfig("model", value)} />
          <Field label="Temperature" value={String(config.temperature ?? 0.2)} onChange={(value) => setConfig("temperature", Number(value))} />
          <Field label="Simulated claim" value={String(config.claim ?? "")} onChange={(value) => setConfig("claim", value)} multiline />
          <p className="hint">The simulated claim is appended only for the simulated provider. A real endpoint returns the model text instead.</p>
        </>
      )}
      {node.data.kind === "tool" && (
        <>
          <label className="field">
            <span>Tool</span>
            <select value={String(config.tool ?? "echo")} onChange={(event) => setConfig("tool", event.target.value)}>
              <option value="studio_relay">studio_relay</option>
              <option value="write_artifact">write_artifact</option>
              <option value="template">template</option>
              <option value="concat">concat</option>
              <option value="json_extract">json_extract</option>
              <option value="echo">echo</option>
              <option value="delay">delay</option>
            </select>
          </label>
          <Field label="Artifact name" value={String(config.artifactName ?? "")} onChange={(value) => setConfig("artifactName", value)} />
          <Field label="Template" value={String(config.contentTemplate ?? "")} onChange={(value) => setConfig("contentTemplate", value)} multiline />
          <Field label="JSON path" value={String(config.path ?? "")} onChange={(value) => setConfig("path", value)} />
          <Field label="Separator" value={String(config.separator ?? "\n")} onChange={(value) => setConfig("separator", value)} />
          <Field label="Delay ms" value={String(config.delayMs ?? 40)} onChange={(value) => setConfig("delayMs", Number(value))} />
          {String(config.tool) === "studio_relay" && (
            <>
              <label className="field">
                <span>Provider</span>
                <select value={String(config.providerId ?? "simulated")} onChange={(event) => setConfig("providerId", event.target.value)}>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">Sends the upstream text through the PHP studio relay. A simulated provider does not call the studio. The studio address and token stay on this machine.</p>
            </>
          )}
        </>
      )}
      {node.data.kind === "branch" && (
        <>
          <label className="field">
            <span>Mode</span>
            <select value={String(config.mode ?? "contains")} onChange={(event) => setConfig("mode", event.target.value)}>
              <option value="contains">contains</option>
              <option value="equals">equals</option>
              <option value="regex">regex</option>
              <option value="json_truthy">json_truthy</option>
            </select>
          </label>
          <Field label="Value" value={String(config.value ?? "")} onChange={(value) => setConfig("value", value)} />
          <Field label="Path" value={String(config.path ?? "")} onChange={(value) => setConfig("path", value)} />
          <p className="hint">Connect the pass and fail handles on the right side of the branch node.</p>
        </>
      )}
      {node.data.kind === "reviewer" && (
        <>
          <Field
            label="Required artifacts"
            value={Array.isArray(config.requiredArtifacts) ? (config.requiredArtifacts as string[]).join(", ") : String(config.requiredArtifacts ?? "")}
            onChange={(value) => setConfig("requiredArtifacts", value.split(",").map((item) => item.trim()).filter(Boolean))}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={config.requireArtifactOnCompletion !== false}
              onChange={(event) => setConfig("requireArtifactOnCompletion", event.target.checked)}
            />
            Reject completion claims that have no upstream artifact
          </label>
          <p className="hint">The reviewer is a deterministic check. It is not another model call.</p>
        </>
      )}
      {node.data.kind === "input" && <p className="hint">The run input in the monitor is delivered to every input node.</p>}
      {node.data.kind === "output" && <p className="hint">Output nodes collect results from the active incoming path.</p>}
    </div>
  );
}
