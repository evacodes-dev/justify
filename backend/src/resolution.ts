import { config, MODELS } from "./config.js";
import { backendSigner, publicClient, arc } from "./chain.js";
import { resolverAbi } from "./abis.js";
import { db } from "./store.js";
import { getRelevantData } from "./market-intel.js";
import { claudeJson } from "./llm.js";
import { hasFeed, readChainlinkPrice } from "./chainlink.js";

// Hybrid resolver:
//   price markets  → Chainlink Data Feed (deterministic, trustless)
//   everything else → Claude Sonnet (subjective/event judgement)
// A Claude (Haiku) classifier routes each question: it decides whether the market is a
// simple crypto-price comparison (Chainlink's job) or needs subjective judgement.

const SCHEMA = {
  type: "object",
  properties: {
    outcome: { type: "string", enum: ["YES", "NO", "INVALID"] },
    reasoning: { type: "string" },
  },
  required: ["outcome", "reasoning"],
  additionalProperties: false,
};

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    chainlinkResolvable: { type: "boolean" },
    asset: { type: "string" }, // ETH | BTC | LINK | ""
    comparator: { type: "string", enum: ["above", "below"] },
    threshold: { type: "number" }, // USD
  },
  required: ["chainlinkResolvable"],
  additionalProperties: false,
};
type Classification = { chainlinkResolvable: boolean; asset?: string; comparator?: "above" | "below"; threshold?: number };

async function classify(question: string): Promise<Classification> {
  return claudeJson<Classification>({
    model: MODELS.agent, // Haiku — fast, cheap routing
    maxTokens: 200,
    system:
      "You route prediction-market questions to the right oracle. A market is Chainlink-resolvable ONLY if it is a pure crypto SPOT-PRICE comparison for ETH, BTC, or LINK of the form 'will <asset> be above/below $<price>' (a date is fine — it's read at resolution time). For those, set chainlinkResolvable=true and extract asset (ETH/BTC/LINK), comparator (above/below), threshold (USD number). For anything subjective, event-based, non-price, or an unsupported asset, set chainlinkResolvable=false.",
    user: `Question: "${question}"`,
    schema: CLASSIFY_SCHEMA,
  }).catch(() => ({ chainlinkResolvable: false }));
}

export async function resolveMarket(marketId: number) {
  const m = db.markets.get(marketId);
  if (!m) return { error: "no market" };
  if (m.resolved) return { error: "already resolved" };

  let outcome: "YES" | "NO" | "INVALID" | undefined;
  let reasoning = "";
  let oracle: "chainlink" | "claude" = "claude";

  // 1) route
  const cls = await classify(m.question);
  if (cls.chainlinkResolvable && cls.asset && hasFeed(cls.asset) && typeof cls.threshold === "number") {
    const p = await readChainlinkPrice(cls.asset).catch(() => null);
    if (p) {
      const isYes = cls.comparator === "below" ? p.price < cls.threshold : p.price > cls.threshold;
      outcome = isYes ? "YES" : "NO";
      reasoning = `Resolved by Chainlink ${cls.asset.toUpperCase()}/USD Data Feed: $${p.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} is ${p.price > cls.threshold ? "above" : "below"} the $${cls.threshold.toLocaleString()} threshold → ${outcome}.`;
      oracle = "chainlink";
    }
  }

  // 2) subjective fallback → Claude Sonnet
  if (!outcome) {
    const data = await getRelevantData(m.question, m.metadataURI);
    const verdict = await claudeJson<{ outcome: "YES" | "NO" | "INVALID"; reasoning: string }>({
      model: MODELS.resolution,
      maxTokens: 500,
      system: "You are an impartial prediction-market resolver. Decide YES, NO, or INVALID for the question using ONLY the data provided for THIS market's topic. Be decisive; cite the number/fact. 2-3 sentence reason.",
      user: `Market: "${m.question}"\nTopic data: ${data.map((d) => `${d.label}=${d.value}`).join("; ")}\nResolve now.`,
      schema: SCHEMA,
    });
    outcome = verdict.outcome;
    reasoning = verdict.reasoning;
    oracle = "claude";
  }

  const outcomeNum = outcome === "YES" ? 1 : outcome === "NO" ? 0 : 2;
  const tx = await backendSigner().run(({ wallet, account }) =>
    wallet.writeContract({ address: config.resolver, abi: resolverAbi, functionName: "resolve", args: [BigInt(marketId), outcomeNum, reasoning], account, chain: arc }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx as `0x${string}` });
  db.markets.patch(marketId, { oracle });
  return { marketId, outcome, reasoning, tx, oracle };
}

export async function resolveDueMarkets() {
  const due = db.markets.all().filter((m) => !m.resolved && m.closeTime * 1000 <= Date.now());
  for (const m of due) {
    try { await resolveMarket(m.id); } catch (e) { console.error(`[resolve #${m.id}]`, (e as Error).message); }
  }
}
