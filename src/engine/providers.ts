import type { ProviderConfig } from "../shared/types";

export type FetchLike = typeof fetch;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function resolveProvider(providers: ProviderConfig[], providerId: string): ProviderConfig {
  const id = providerId || "simulated";
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new Error(`Unknown provider "${id}"`);
  return provider;
}

export async function callOpenAICompatible(options: {
  provider: ProviderConfig;
  model: string;
  temperature: number;
  messages: ChatMessage[];
  fetchImpl: FetchLike;
}): Promise<{ text: string; raw: unknown }> {
  const baseUrl = options.provider.baseUrl?.trim();
  if (!baseUrl) throw new Error(`Provider "${options.provider.name}" has no base URL`);
  const model = options.model.trim() || options.provider.model?.trim();
  if (!model) throw new Error(`Provider "${options.provider.name}" has no model`);

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.provider.apiKey) headers.Authorization = `Bearer ${options.provider.apiKey}`;

  const response = await options.fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: options.temperature,
      messages: options.messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Provider HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  const raw = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const text = raw.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("Provider response is missing choices[0].message.content");
  return { text, raw };
}
