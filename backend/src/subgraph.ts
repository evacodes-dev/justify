import { config } from "./config.js";

// The Graph — the indexed view of our markets on Base Sepolia.
//
// Two consumers, and the second is the interesting one:
//   1. read paths that would otherwise poll the chain (charts, leaderboards, positions);
//   2. the resolution agent, which pulls a market's live trading record from here BEFORE it
//      issues a verdict. Crowd behaviour is evidence: a market that drifted steadily to 0.9
//      on broad participation reads very differently from one a single wallet shoved there in
//      the last hour, and the agent is asked to weigh that rather than trust the last price.
//
// Everything the agent reads is recorded into the justification bundle — query and response —
// so the evidence behind a resolution can be re-checked by anyone later.

export type SubgraphTrade = {
  isBuy: boolean;
  outcome: "YES" | "NO" | "INVALID";
  amountUSDC: string;
  shares: string;
  price: string;
  yesPriceAfter: string;
  timestamp: string;
  trader: { id: string };
};

export type MarketContext = {
  marketId: string;
  question: string;
  status: string;
  yesPrice: number;
  volumeUSDC: number;
  liquidityUSDC: number;
  tradeCount: number;
  traderCount: number;
  closeTime: number;
  priceSeries: { yesPrice: number; timestamp: number }[];
  recentTrades: SubgraphTrade[];
  topTraders: { id: string; volumeUSDC: string; realizedPnlUSDC: string }[];
  /// Exactly what was asked and what came back — copied into the justification bundle.
  provenance: { endpoint: string; query: string; variables: Record<string, unknown>; raw: unknown };
};

export class SubgraphError extends Error {}

export async function querySubgraph<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data: T; raw: unknown }> {
  if (!config.subgraphUrl) throw new SubgraphError("SUBGRAPH_URL not set");

  const res = await fetch(config.subgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new SubgraphError(`subgraph HTTP ${res.status}`);

  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new SubgraphError(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw new SubgraphError("subgraph returned no data");
  return { data: body.data, raw: body };
}

const MARKET_CONTEXT_QUERY = `query MarketContext($id: ID!, $trades: Int!) {
  market(id: $id) {
    id
    question
    status
    yesPrice
    volumeUSDC
    liquidityUSDC
    tradeCount
    traderCount
    closeTime
    pricePoints(orderBy: timestamp, orderDirection: asc, first: 100) {
      yesPrice
      timestamp
    }
    trades(orderBy: timestamp, orderDirection: desc, first: $trades) {
      isBuy
      outcome
      amountUSDC
      shares
      price
      yesPriceAfter
      timestamp
      trader { id }
    }
    positions(orderBy: yesShares, orderDirection: desc, first: 5) {
      trader { id volumeUSDC realizedPnlUSDC }
    }
  }
}`;

/// Pull the live trading record for one market. Returns null when the subgraph has not indexed
/// the market — callers fall back to resolving without market context rather than blocking.
export async function getMarketContext(
  marketId: number | string,
  tradeLimit = 25,
): Promise<MarketContext | null> {
  const variables = { id: String(marketId), trades: tradeLimit };
  const { data, raw } = await querySubgraph<{ market: any }>(MARKET_CONTEXT_QUERY, variables);
  if (!data.market) return null;
  const m = data.market;

  return {
    marketId: m.id,
    question: m.question,
    status: m.status,
    yesPrice: Number(m.yesPrice),
    volumeUSDC: Number(m.volumeUSDC),
    liquidityUSDC: Number(m.liquidityUSDC),
    tradeCount: m.tradeCount,
    traderCount: m.traderCount,
    closeTime: Number(m.closeTime),
    priceSeries: (m.pricePoints ?? []).map((p: any) => ({
      yesPrice: Number(p.yesPrice),
      timestamp: Number(p.timestamp),
    })),
    recentTrades: m.trades ?? [],
    topTraders: (m.positions ?? []).map((p: any) => p.trader),
    provenance: { endpoint: config.subgraphUrl, query: MARKET_CONTEXT_QUERY, variables, raw },
  };
}

/// Condense the indexed record into the prompt block the agent reasons over. Deliberately
/// includes concentration and late-flow signals, not just the closing price — those are what
/// separate "the crowd concluded this" from "someone pushed this".
export function describeMarketContext(ctx: MarketContext): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const lines: string[] = [];

  lines.push(`Indexed market data (The Graph subgraph, live):`);
  lines.push(`- Current YES price: ${pct(ctx.yesPrice)}`);
  lines.push(`- Volume: $${ctx.volumeUSDC.toFixed(2)} across ${ctx.tradeCount} trades by ${ctx.traderCount} trader(s)`);
  lines.push(`- Liquidity: $${ctx.liquidityUSDC.toFixed(2)}`);

  if (ctx.priceSeries.length > 1) {
    const first = ctx.priceSeries[0];
    const last = ctx.priceSeries[ctx.priceSeries.length - 1];
    const move = last.yesPrice - first.yesPrice;
    lines.push(
      `- YES price moved ${pct(first.yesPrice)} → ${pct(last.yesPrice)} (${move >= 0 ? "+" : ""}${(move * 100).toFixed(1)}pp) over ${ctx.priceSeries.length} recorded points`,
    );
  }

  const cutoff = ctx.closeTime - 6 * 3600;
  const late = ctx.recentTrades.filter((t) => Number(t.timestamp) >= cutoff);
  if (late.length) {
    const lateYes = late.filter((t) => t.outcome === "YES" && t.isBuy).length;
    const lateNo = late.filter((t) => t.outcome === "NO" && t.isBuy).length;
    lines.push(`- Last 6h before close: ${late.length} trade(s), ${lateYes} YES buys vs ${lateNo} NO buys`);
  }

  const byTrader = new Map<string, number>();
  for (const t of ctx.recentTrades) {
    byTrader.set(t.trader.id, (byTrader.get(t.trader.id) ?? 0) + Math.abs(Number(t.amountUSDC)));
  }
  const total = [...byTrader.values()].reduce((a, b) => a + b, 0);
  const top = [...byTrader.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && total > 0) {
    lines.push(
      `- Concentration: the largest single trader accounts for ${pct(top[1] / total)} of recent volume (${byTrader.size} distinct traders in the sample)`,
    );
  }

  if (ctx.tradeCount < 3 || ctx.traderCount < 2) {
    lines.push(
      `- CAUTION: thin market — too few trades/traders for the price to carry meaningful information.`,
    );
  }

  return lines.join("\n");
}