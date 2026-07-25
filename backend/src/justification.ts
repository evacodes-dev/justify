import { config, MODELS } from "./config.js";
import { claudeJson } from "./llm.js";
import { getRelevantData } from "./market-intel.js";
import { describeMarketContext, getMarketContext, type MarketContext } from "./subgraph.js";
import { zgJson, type TeeAttestation } from "./zg-compute.js";
import { uploadJson } from "./zg-storage.js";
import { anchorAttestation } from "./zg-attest.js";

// Every AI resolution publishes its own evidence.
//
// The verdict is produced through 0G Compute, the market context it reasons over comes from the
// subgraph (live, indexed — including the queries themselves), and the whole record is uploaded
// to 0G Storage, which addresses it by Merkle root. Only that root goes on-chain, so the
// evidence cannot be edited after the fact without breaking the pointer, and anyone reviewing
// the market during the challenge window can pull the bundle and check the reasoning against
// the same data the agent saw.

export type Verdict = { outcome: "YES" | "NO" | "INVALID"; reasoning: string };

export type Justification = {
  verdict: Verdict;
  /// What goes on-chain as the proposal's `reason`: a readable verdict plus the bundle pointer.
  reason: string;
  bundleUri: string | null;
  bundleRoot: string | null;
  storageTx: string | null;
  anchorTx: string | null;
  tee: TeeAttestation | null;
  oracle: "0g" | "claude";
};

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    outcome: { type: "string", enum: ["YES", "NO", "INVALID"] },
    reasoning: { type: "string" },
  },
  required: ["outcome", "reasoning"],
  additionalProperties: false,
};

const SYSTEM =
  "You are an impartial prediction-market resolver. Decide YES, NO, or INVALID using the evidence provided. " +
  "Treat the indexed market data as evidence of what traders believed, not as proof of the outcome: say so explicitly " +
  "when the market is too thin or too concentrated for its price to carry information. Cite the number or fact you relied on. " +
  "Keep the reasoning to 2-3 sentences.";

function buildPrompt(question: string, topicData: string, ctx: MarketContext | null): string {
  const parts = [`Market: "${question}"`];
  if (topicData) parts.push(`Topic data: ${topicData}`);
  if (ctx) parts.push(describeMarketContext(ctx));
  parts.push("Resolve now.");
  return parts.join("\n\n");
}

/// Produce the verdict, publish the evidence, anchor it. Degrades in steps rather than failing:
/// no subgraph → resolve without market context; 0G unavailable → fall back to the default
/// model; upload or anchor fails → the market still resolves, with the gap recorded.
export async function resolveWithJustification(
  marketId: number,
  question: string,
  metadataURI: string,
): Promise<Justification> {
  const [topic, ctx] = await Promise.all([
    getRelevantData(question, metadataURI).catch(() => []),
    config.subgraphUrl
      ? getMarketContext(marketId).catch((e) => {
          console.error(`[justify #${marketId}] subgraph:`, (e as Error).message);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const topicData = topic.map((d) => `${d.label}=${d.value}`).join("; ");
  const user = buildPrompt(question, topicData, ctx);

  let verdict: Verdict;
  let tee: TeeAttestation | null = null;
  let raw = "";
  let oracle: "0g" | "claude" = "claude";

  if (config.zg.enabled) {
    try {
      const res = await zgJson<Verdict>({ system: SYSTEM, user, schema: VERDICT_SCHEMA, maxTokens: 600 });
      verdict = normalizeVerdict(res.value);
      tee = res.tee;
      raw = res.raw;
      oracle = "0g";
    } catch (e) {
      console.error(`[justify #${marketId}] 0G inference failed, falling back:`, (e as Error).message);
      verdict = normalizeVerdict(
        await claudeJson<Verdict>({ model: MODELS.resolution, maxTokens: 500, system: SYSTEM, user, schema: VERDICT_SCHEMA }),
      );
    }
  } else {
    verdict = normalizeVerdict(
      await claudeJson<Verdict>({ model: MODELS.resolution, maxTokens: 500, system: SYSTEM, user, schema: VERDICT_SCHEMA }),
    );
  }

  const bundle = {
    kind: "justify.justification.v1",
    marketId,
    question,
    verdict,
    graphData: ctx
      ? {
          endpoint: ctx.provenance.endpoint,
          query: ctx.provenance.query,
          variables: ctx.provenance.variables,
          summary: describeMarketContext(ctx),
          snapshot: {
            yesPrice: ctx.yesPrice,
            volumeUSDC: ctx.volumeUSDC,
            liquidityUSDC: ctx.liquidityUSDC,
            tradeCount: ctx.tradeCount,
            traderCount: ctx.traderCount,
          },
          response: ctx.provenance.raw,
        }
      : null,
    topicData: topic,
    compute: tee,
    modelReplyRaw: raw || undefined,
    settlementChain: { network: config.network, chainId: config.chainId, registry: config.registry },
    createdAt: new Date().toISOString(),
  };

  let bundleUri: string | null = null;
  let bundleRoot: string | null = null;
  let storageTx: string | null = null;
  let anchorTx: string | null = null;

  if (config.zg.enabled && config.zg.pk) {
    try {
      const up = await uploadJson(bundle);
      bundleUri = up.uri;
      bundleRoot = up.rootHash;
      storageTx = up.txHash || null;
    } catch (e) {
      console.error(`[justify #${marketId}] 0G Storage upload failed:`, (e as Error).message);
    }

    if (bundleRoot !== null && tee !== null) {
      const anchor = await anchorAttestation({ marketId, bundleRoot, outcome: verdict.outcome, tee });
      anchorTx = anchor?.txHash ?? null;
    }
  }

  return {
    verdict,
    reason: composeReason(verdict, bundleUri),
    bundleUri,
    bundleRoot,
    storageTx,
    anchorTx,
    tee,
    oracle,
  };
}

/// The on-chain reason is what challengers read during the window, so it stays human-readable
/// and carries the pointer to the full evidence rather than replacing it.
function composeReason(verdict: Verdict, bundleUri: string | null): string {
  const base = verdict.reasoning.trim();
  return bundleUri === null ? base : `${base} [evidence: ${bundleUri}]`;
}

/// Open models rename fields even when the schema is spelled out — recover the verdict from the
/// usual aliases instead of failing the resolution over a key name.
function normalizeVerdict(value: unknown): Verdict {
  const v = (value ?? {}) as Record<string, unknown>;
  const rawOutcome = v.outcome ?? v.answer ?? v.result ?? v.verdict ?? v.decision;
  const rawReason = v.reasoning ?? v.reason ?? v.explanation ?? v.rationale ?? "";

  const outcome = String(rawOutcome ?? "").trim().toUpperCase();
  if (outcome !== "YES" && outcome !== "NO" && outcome !== "INVALID") {
    throw new Error(`unrecognized verdict outcome: ${JSON.stringify(rawOutcome)}`);
  }
  return { outcome, reasoning: String(rawReason) };
}

export const bundleUriFromReason = (reason: string): string | null =>
  reason.match(/0g:\/\/(0x)?[0-9a-fA-F]+/)?.[0] ?? null;