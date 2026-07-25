import { config, MODELS } from "./config.js";
import { backendSigner, publicClient, arc } from "./chain.js";
import { resolverAbi, aggregatorDecimalsAbi, settlerAbi, registryAbi } from "./abis.js";
import { db } from "./store.js";
import { claudeJson } from "./llm.js";
import { hasFeed, readChainlinkPrice } from "./chainlink.js";
import { resolveWithJustification } from "./justification.js";

// Hybrid resolver:
//   price markets  → Chainlink Data Feed (deterministic, trustless)
//   everything else → Claude Sonnet (subjective/event judgement)
// A Claude (Haiku) classifier routes each question: it decides whether the market is a
// simple crypto-price comparison (Chainlink's job) or needs subjective judgement.

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

// Trustless ON-CHAIN price resolution: register the feed config (set-once) then trigger
// Resolver.resolveByPrice, which reads the Chainlink feed IN the contract and resolves.
// The outcome is derived on-chain from the live price — independently verifiable.
async function resolveOnchainPrice(
  marketId: number,
  asset: string,
  feed: `0x${string}`,
  threshold: number,
  comparator: "above" | "below",
) {
  // read the feed's actual decimals (USD feeds are 8, but never assume — a wrong scale
  // would silently create a wrong-threshold market rule)
  const feedDecimals = (await publicClient.readContract({
    address: feed,
    abi: aggregatorDecimalsAbi,
    functionName: "decimals",
  })) as number;
  const thresholdScaled = BigInt(Math.round(threshold * 10 ** Number(feedDecimals)));
  const comparatorNum = comparator === "above" ? 1 : 0; // enum Comparator { Below=0, Above=1 }

  const existing = (await publicClient.readContract({
    address: config.resolver,
    abi: resolverAbi,
    functionName: "priceFeeds",
    args: [BigInt(marketId)],
  })) as readonly [string, bigint, number, bigint, boolean];
  if (!existing[4]) {
    const txSet = await backendSigner().run(({ wallet, account }) =>
      wallet.writeContract({
        address: config.resolver,
        abi: resolverAbi,
        functionName: "setPriceFeed",
        args: [BigInt(marketId), feed, thresholdScaled, comparatorNum, BigInt(config.feedMaxStaleSec)],
        account,
        chain: arc,
      }),
    );
    await publicClient.waitForTransactionReceipt({ hash: txSet as `0x${string}` });
  }
  const tx = await backendSigner().run(({ wallet, account }) =>
    wallet.writeContract({
      address: config.resolver,
      abi: resolverAbi,
      functionName: "resolveByPrice",
      args: [BigInt(marketId)],
      account,
      chain: arc,
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx as `0x${string}` });
  db.markets.patch(marketId, { oracle: "chainlink" });
  return { marketId, tx, oracle: "chainlink" as const, onchain: true };
}

export async function resolveMarket(marketId: number) {
  const m = db.markets.get(marketId);
  if (!m) return { error: "no market" };
  if (m.resolved) return { error: "already resolved" };
  // the local DB can lag the chain (indexer catch-up) — never retry an on-chain-resolved market
  if (config.registry) {
    const onchain = (await publicClient.readContract({
      address: config.registry, abi: registryAbi, functionName: "isResolved", args: [BigInt(marketId)],
    })) as boolean;
    if (onchain) {
      db.markets.patch(marketId, { resolved: true });
      return { error: "already resolved on-chain" };
    }
  }

  let outcome: "YES" | "NO" | "INVALID" | undefined;
  let reasoning = "";
  let oracle: "chainlink" | "claude" | "0g" = "claude";

  // 1) route. Structured price markets (creator picked asset/comparator/threshold in the
  // form) skip the LLM classifier entirely — fully deterministic routing.
  let cls: Classification;
  try {
    const meta = JSON.parse(m.metadataURI || "{}");
    cls = meta.price?.asset
      ? { chainlinkResolvable: true, asset: String(meta.price.asset), comparator: meta.price.comparator === "below" ? "below" : "above", threshold: Number(meta.price.threshold) }
      : await classify(m.question);
  } catch {
    cls = await classify(m.question);
  }
  const asset = cls.asset?.toUpperCase();
  if (cls.chainlinkResolvable && asset && typeof cls.threshold === "number" && cls.comparator) {
    // 1a) PREFERRED: trustless on-chain resolution when a feed is configured on the settlement chain
    const onchain = config.onchainFeeds[asset];
    if (onchain) {
      try {
        return await resolveOnchainPrice(marketId, asset, onchain, cls.threshold, cls.comparator);
      } catch (e) {
        console.error(`[resolve #${marketId}] on-chain price failed, falling back:`, (e as Error).message);
      }
    }
    // 1b) FALLBACK: off-chain Chainlink read + push (e.g. Arc/testnet without on-chain feeds)
    if (hasFeed(asset)) {
      const p = await readChainlinkPrice(asset).catch(() => null);
      if (p) {
        const isYes = cls.comparator === "below" ? p.price < cls.threshold : p.price > cls.threshold;
        outcome = isYes ? "YES" : "NO";
        reasoning = `Resolved by Chainlink ${asset}/USD Data Feed: $${p.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} is ${p.price > cls.threshold ? "above" : "below"} the $${cls.threshold.toLocaleString()} threshold → ${outcome}.`;
        oracle = "chainlink";
      }
    }
  }

  // 2) subjective path. With the OptimisticSettler configured, the AI layer PROPOSES the
  // outcome (public challenge window; UMA decides disputes) — it never finalizes directly.
  if (!outcome && config.settler) return advanceOptimistic(marketId, m.question, m.metadataURI);

  // 2b) subjective verdict (legacy direct path when no settler configured) — still publishes
  // its justification bundle; without a challenge window the evidence trail matters more, not
  // less, since nobody gets to dispute the verdict before it pays out.
  if (!outcome) {
    const j = await subjectiveVerdict(marketId, m.question, m.metadataURI);
    outcome = j.verdict.outcome;
    reasoning = j.reason;
    oracle = j.oracle;
  }

  const outcomeNum = outcome === "YES" ? 1 : outcome === "NO" ? 0 : 2;
  const tx = await backendSigner().run(({ wallet, account }) =>
    wallet.writeContract({ address: config.resolver, abi: resolverAbi, functionName: "resolve", args: [BigInt(marketId), outcomeNum, reasoning], account, chain: arc }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx as `0x${string}` });
  db.markets.patch(marketId, { oracle });
  return { marketId, outcome, reasoning, tx, oracle };
}

// Subjective verdicts go through the justification pipeline: the agent reasons over the live
// indexed market record from the subgraph, the verdict is produced on 0G Compute, and the whole
// evidence bundle lands in 0G Storage with only its root travelling on-chain. See
// justification.ts — it degrades to the default model and a plain reason string if 0G is off.
async function subjectiveVerdict(marketId: number, question: string, metadataURI: string) {
  return resolveWithJustification(marketId, question, metadataURI);
}

// State machine for the optimistic path — idempotent, driven by the resolve cron:
//   none → AI verdict → propose;  proposed → finalize once the window passed;
//   challenged → settle the UMA assertion once its liveness passed (revert = still live);
//   settled → done (the indexer picks up Market's Resolved event).
async function advanceOptimistic(marketId: number, question: string, metadataURI: string) {
  const settler = config.settler!;
  const p = (await publicClient.readContract({
    address: settler,
    abi: settlerAbi,
    functionName: "proposals",
    args: [BigInt(marketId)],
  })) as readonly [number, number, number, bigint, string, string, string, string];
  const status = Number(p[2]); // 0 none, 1 proposed, 2 challenged, 3 settled

  if (status === 0) {
    const j = await subjectiveVerdict(marketId, question, metadataURI);
    const outcomeNum = j.verdict.outcome === "YES" ? 1 : j.verdict.outcome === "NO" ? 0 : 2;
    const tx = await backendSigner().run(({ wallet, account }) =>
      wallet.writeContract({ address: settler, abi: settlerAbi, functionName: "propose", args: [BigInt(marketId), outcomeNum, j.reason], account, chain: arc }),
    );
    await publicClient.waitForTransactionReceipt({ hash: tx as `0x${string}` });
    db.markets.patch(marketId, { oracle: j.oracle });
    return {
      marketId,
      status: "proposed",
      outcome: j.verdict.outcome,
      reasoning: j.verdict.reasoning,
      tx,
      oracle: j.oracle,
      bundleUri: j.bundleUri,
      anchorTx: j.anchorTx,
      tee: j.tee,
    };
  }
  if (status === 1) {
    const ready = (await publicClient.readContract({ address: settler, abi: settlerAbi, functionName: "canFinalize", args: [BigInt(marketId)] })) as boolean;
    if (!ready) return { marketId, status: "challenge_window" };
    const tx = await backendSigner().run(({ wallet, account }) =>
      wallet.writeContract({ address: settler, abi: settlerAbi, functionName: "finalize", args: [BigInt(marketId)], account, chain: arc }),
    );
    await publicClient.waitForTransactionReceipt({ hash: tx as `0x${string}` });
    return { marketId, status: "finalized", tx };
  }
  if (status === 2) {
    // challenged → escalated to UMA; settle once its liveness passed (reverts while live)
    try {
      const tx = await backendSigner().run(({ wallet, account }) =>
        wallet.writeContract({ address: settler, abi: settlerAbi, functionName: "settleChallenge", args: [BigInt(marketId)], account, chain: arc }),
      );
      await publicClient.waitForTransactionReceipt({ hash: tx as `0x${string}` });
      return { marketId, status: "challenge_settled", tx };
    } catch {
      return { marketId, status: "dispute_pending" };
    }
  }
  return { marketId, status: "settled" };
}

export async function resolveDueMarkets() {
  const due = db.markets.all().filter((m) => !m.resolved && m.closeTime * 1000 <= Date.now());
  for (const m of due) {
    try { await resolveMarket(m.id); } catch (e) { console.error(`[resolve #${m.id}]`, (e as Error).message); }
  }
}
