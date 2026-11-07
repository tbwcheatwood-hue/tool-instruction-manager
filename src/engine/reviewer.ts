import type { Artifact } from "../shared/types";

const COMPLETION = /\b(complete|completed|done|finished)\b/i;
const ARTIFACT_REF = /artifact:([A-Za-z0-9._-]+)/g;

export function reviewClaim(options: {
  texts: string[];
  artifacts: Artifact[];
  required: string[];
  requireArtifactOnCompletion: boolean;
}): { verdict: "pass" | "reject"; reasons: string[] } {
  const reasons: string[] = [];
  const byName = new Map(options.artifacts.map((artifact) => [artifact.name, artifact]));

  for (const name of options.required) {
    const artifact = byName.get(name);
    if (!artifact || !artifact.content.trim()) reasons.push(`Missing or empty artifact: ${name}`);
  }

  const blob = options.texts.join("\n");
  for (const match of blob.matchAll(ARTIFACT_REF)) {
    const name = match[1];
    const artifact = byName.get(name);
    if (!artifact || !artifact.content.trim()) {
      reasons.push(`Claim references artifact:${name}, which is missing or empty`);
    }
  }

  const claimsComplete = COMPLETION.test(blob);
  const anyArtifact = options.artifacts.some((artifact) => artifact.content.trim());
  if (options.requireArtifactOnCompletion && claimsComplete && !anyArtifact) {
    reasons.push("Completion was claimed, but no supporting artifacts were produced upstream");
  }

  return { verdict: reasons.length ? "reject" : "pass", reasons };
}
