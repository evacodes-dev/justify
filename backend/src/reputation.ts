import { config } from "./config.js";
import { querySubgraph } from "./subgraph.js";
import { uploadJson } from "./zg-storage.js";

// Reputation for trading agents, computed from their on-chain track record.
//
// A prediction market produces the one thing agent-reputation systems usually lack: ground
// truth. Every bet is a prediction with a recorded entry price, and the market later resolves
// YES or NO through the verifiable-AI + challenge-window pipeline. Scoring against that is
// calibration measurement, not review aggregation.
//
// Everything here is recomputable by anyone: inputs come from the public subgraph (the exact
// query ships in the provenance block), the formula is below, and the report is published to
// 0G Storage where its Merkle root pins the content. We sell the convenience, not the truth.
//
// Score v1 — resolved markets only:
//   score = 100 · (0.35·hitRate + 0.30·edgeNorm + 0.20·pnlNorm + 0.15·breadth) · recency
//   hitRate  — share of buys on the side that won
//   edgeNorm — mean (outcome − entry price) per buy, mapped from [-1,1] to [0,1]; this is the
//              calibration term: buying YES at 0.60 on a market that resolves YES earns +0.40
//   pnlNorm  — clamp(0.5 + realizedPnl/volume, 0, 1), the subgraph's average-cost PnL
//   breadth  — min(1, distinctResolvedMarkets/5); anti-wash: breadth, not volume, scales it
//   recency  — max(0.5, 1 − daysSinceLastTrade/30); a stale record decays toward half weight

const WEIGHTS = { hitRate: 0.35, edge: 0.3, pnl: 0.2, breadth: 0.15 };
const BREADTH_TARGET = 5;
const RECENCY_HALF_DAYS = 30;

const REPUTATION_QUERY = `query Reputation($id: ID!, $trades: Int!) {
  trader(id: $id) {
    volumeUSDC
    realizedPnlUSDC
    tradeCount
    marketsTraded
    firstSeenAt
    lastSeenAt
  }
  trades(where: { trader: $id }, orderBy: timestamp, orderDirection: desc, first: $trades) {
    isBuy
    outcome
    price
    amountUSDC
    shares
    timestamp
    market {
      id
      status
      outcome
      question
    }
  }
}`;

type RawTrade = {
  isBuy: boolean;
  outcome: "YES" | "NO" | "INVALID";
  price: string;
  amountUSDC: string;
  shares: string;
  timestamp: string;
  market: { id: string; status: string; outcome: "YES" | "NO" | "INVALID" | null; question: string };
};

export type ReputationReport = {
  kind: "justify.reputation.v1";
  address: string;
  score: number;
  components: {
    hitRate: number;
    edgeNorm: number;
    pnlNorm: number;
    breadth: number;
    recency: number;
  };
  sample: {
    tradeCount: number;
    scoredBuys: number;
    resolvedMarkets: number;
    volumeUSDC: number;
    realizedPnlUSDC: number;
    lastTradeAt: number | null;
  };
  /// Per-bet evidence on resolved markets — enough to recompute hitRate and edge by hand.
  scoredTrades: {
    marketId: string;
    question: string;
    side: string;
    entryPrice: number;
    stakeUSDC: number;
    marketOutcome: string;
    won: boolean;
    edge: number;
  }[];
  formula: string;
  provenance: { endpoint: string; query: string; variables: Record<string, unknown> };
  createdAt: string;
};

export class NoTrackRecordError extends Error {}

export async function computeReputation(address: string): Promise<ReputationReport> {
  const id = address.toLowerCase();
  const variables = { id, trades: 500 };
  const { data } = await querySubgraph<{ trader: any; trades: RawTrade[] }>(
    REPUTATION_QUERY,
    variables,
  );

  if (data.trader === null || data.trader === undefined) {
    throw new NoTrackRecordError(`no on-chain trading record for ${address}`);
  }

  // Only buys on markets that actually resolved YES/NO carry prediction signal. Sells are
  // position management (already reflected in realized PnL) and INVALID splits decide nothing.
  const scoredBuys = data.trades.filter(
    (t) =>
      t.isBuy &&
      t.market.status === "RESOLVED" &&
      (t.market.outcome === "YES" || t.market.outcome === "NO") &&
      (t.outcome === "YES" || t.outcome === "NO"),
  );

  const scoredTrades = scoredBuys.map((t) => {
    const entryPrice = Number(t.price);
    const won = t.outcome === t.market.outcome;
    return {
      marketId: t.market.id,
      question: t.market.question,
      side: t.outcome,
      entryPrice,
      stakeUSDC: Number(t.amountUSDC),
      marketOutcome: t.market.outcome as string,
      won,
      // Outcome-vs-entry-price margin: what the bet earned per share over what it cost.
      edge: won ? 1 - entryPrice : -entryPrice,
    };
  });

  const resolvedMarkets = new Set(scoredTrades.map((t) => t.marketId)).size;
  const volume = Number(data.trader.volumeUSDC);
  const pnl = Number(data.trader.realizedPnlUSDC);
  const lastSeenAt = data.trader.lastSeenAt === null ? null : Number(data.trader.lastSeenAt);

  const hitRate =
    scoredTrades.length === 0
      ? 0
      : scoredTrades.filter((t) => t.won).length / scoredTrades.length;
  const meanEdge =
    scoredTrades.length === 0
      ? 0
      : scoredTrades.reduce((a, t) => a + t.edge, 0) / scoredTrades.length;
  const edgeNorm = clamp01((meanEdge + 1) / 2);
  const pnlNorm = volume > 0 ? clamp01(0.5 + pnl / volume) : 0.5;
  const breadth = Math.min(1, resolvedMarkets / BREADTH_TARGET);

  const daysSinceLast =
    lastSeenAt === null ? RECENCY_HALF_DAYS : (Date.now() / 1000 - lastSeenAt) / 86_400;
  const recency = Math.max(0.5, 1 - daysSinceLast / RECENCY_HALF_DAYS);

  const raw =
    WEIGHTS.hitRate * hitRate +
    WEIGHTS.edge * edgeNorm +
    WEIGHTS.pnl * pnlNorm +
    WEIGHTS.breadth * breadth;
  const score = Math.round(100 * raw * recency);

  return {
    kind: "justify.reputation.v1",
    address: id,
    score,
    components: {
      hitRate: round4(hitRate),
      edgeNorm: round4(edgeNorm),
      pnlNorm: round4(pnlNorm),
      breadth: round4(breadth),
      recency: round4(recency),
    },
    sample: {
      tradeCount: data.trader.tradeCount,
      scoredBuys: scoredTrades.length,
      resolvedMarkets,
      volumeUSDC: volume,
      realizedPnlUSDC: pnl,
      lastTradeAt: lastSeenAt,
    },
    scoredTrades,
    formula:
      "score = 100 · (0.35·hitRate + 0.30·edgeNorm + 0.20·pnlNorm + 0.15·breadth) · recency; " +
      "edge per buy = won ? 1−entryPrice : −entryPrice; resolved YES/NO markets only",
    provenance: { endpoint: config.subgraphUrl, query: REPUTATION_QUERY, variables },
    createdAt: new Date().toISOString(),
  };
}

export type PublishedReputation = {
  report: ReputationReport;
  bundleUri: string | null;
  bundleUrl: string | null;
};

/// Compute and pin the report to 0G Storage. The upload is best-effort: a scoring API that
/// fails because a storage node hiccuped would be worse than a report without a pin.
export async function computeAndPublishReputation(address: string): Promise<PublishedReputation> {
  const report = await computeReputation(address);

  let bundleUri: string | null = null;
  if (config.zg.enabled && config.zg.pk) {
    try {
      const up = await uploadJson(report);
      bundleUri = up.uri;
    } catch (e) {
      console.error("[reputation] 0G pin failed:", (e as Error).message);
    }
  }

  return {
    report,
    bundleUri,
    bundleUrl: bundleUri === null ? null : `/api/justification/${bundleUri.slice("0g://".length)}`,
  };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;