import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

const client = new Anthropic({ apiKey: config.anthropicKey });

// Strict JSON via forced tool-use (reliable across SDK versions; no prefill, no nullable-enum).
export async function claudeJson<T>(opts: {
  model: string;
  system: string;
  user: string;
  schema: any;
  maxTokens?: number;
}): Promise<T> {
  const res = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 900,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    tools: [{ name: "respond", description: "Return the structured decision.", input_schema: opts.schema }],
    tool_choice: { type: "tool", name: "respond" },
  });
  const tu = res.content.find((c) => c.type === "tool_use") as any;
  if (!tu) throw new Error("no tool_use in response");
  return tu.input as T;
}
