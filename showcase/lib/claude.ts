import Anthropic from "@anthropic-ai/sdk";

// Server-side Claude helper (reads ANTHROPIC_API_KEY). Forces strict JSON via
// output_config.format (json_schema) — the most reliable structured-output path.
const client = new Anthropic();

export const MODELS = {
  agent: "claude-haiku-4-5",      // fast + cheap for the 2-min agent loop
  resolution: "claude-sonnet-4-6", // higher quality for market resolution
} as const;

export async function claudeJson<T>(opts: {
  model: string;
  system?: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const res = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: "user", content: opts.user }],
    // output_config is newer than the SDK types in some versions — cast through.
    output_config: { format: { type: "json_schema", schema: opts.schema } },
  } as any);
  const text = (res.content as any[]).find((b) => b.type === "text");
  return JSON.parse(text.text) as T;
}
