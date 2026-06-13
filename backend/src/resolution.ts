import { config, MODELS } from "./config.js";
import { backendSigner, publicClient, arc } from "./chain.js";
import { resolverAbi } from "./abis.js";
import { db } from "./store.js";
import { getRelevantData } from "./market-intel.js";
import { claudeJson } from "./llm.js";

const SCHEMA = {
  type: "object",
  properties: {
    outcome: { type: "string", enum: ["YES", "NO", "INVALID"] },
    reasoning: { type: "string" },
  },
  required: ["outcome", "reasoning"],
  additionalProperties: false,
};

// LLM resolution with topic-aware data (NOT the showcase ETH-for-everything bug).
// CRE only simulates; the backend (oracle) writes the actual resolve + on-chain reason.
export async function resolveMarket(marketId: number) {
  const m = db.markets.get(marketId);
  if (!m) return { error: "no market" };
  if (m.resolved) return { error: "already resolved" };

  const data = await getRelevantData(m.question, m.metadataURI);
  const verdict = await claudeJson<{ outcome: "YES" | "NO" | "INVALID"; reasoning: string }>({
    model: MODELS.resolution, // Sonnet 4.6
    maxTokens: 500,
    system: "You are an impartial prediction-market resolver. Decide YES, NO, or INVALID for the question using ONLY the data provided for THIS market's topic. Be decisive; cite the number/fact. 2-3 sentence reason.",
    user: `Market: "${m.question}"\nTopic data: ${data.map((d) => `${d.label}=${d.value}`).join("; ")}\nResolve now.`,
    schema: SCHEMA,
  });

  const outcomeNum = verdict.outcome === "YES" ? 1 : verdict.outcome === "NO" ? 0 : 2;
  const tx = await backendSigner().run(({ wallet, account }) =>
    wallet.writeContract({ address: config.resolver, abi: resolverAbi, functionName: "resolve", args: [BigInt(marketId), outcomeNum, verdict.reasoning], account, chain: arc }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx as `0x${string}` });
  return { marketId, outcome: verdict.outcome, reasoning: verdict.reasoning, tx };
}

export async function resolveDueMarkets() {
  const due = db.markets.all().filter((m) => !m.resolved && m.closeTime * 1000 <= Date.now());
  for (const m of due) {
    try { await resolveMarket(m.id); } catch (e) { console.error(`[resolve #${m.id}]`, (e as Error).message); }
  }
}
