import type { ChartRange, MarketHistory } from './api'

// Reads that come straight from The Graph rather than from our backend.
//
// The price series is the clearest case: the audited FixedProductMarketMaker emits no price, so
// it has to be derived from pooled outcome-token balances after every trade. The subgraph does
// that in its mappings and stores the result as PricePoint entities, which means the chart, the
// leaderboard and the agent that resolves markets all read the same derived numbers from the
// same indexed source instead of each recomputing them.
//
// Falls back to the backend when VITE_SUBGRAPH_URL is unset, so the app still runs without it.

const SUBGRAPH_URL: string = import.meta.env.VITE_SUBGRAPH_URL ?? ''

export const hasSubgraph = (): boolean => SUBGRAPH_URL !== ''

async function query<T>(document: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: document, variables }),
  })
  if (!res.ok) throw new Error(`subgraph HTTP ${res.status}`)
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '))
  if (!body.data) throw new Error('subgraph returned no data')
  return body.data
}

const RANGE_SECONDS: Record<ChartRange, number | null> = {
  '1H': 3_600,
  '6H': 21_600,
  '1D': 86_400,
  '1W': 604_800,
  '1M': 2_592_000,
  ALL: null,
}

const HISTORY_QUERY = `query History($id: ID!, $since: BigInt!) {
  market(id: $id) {
    yesPrice
    status
    tradeCount
    createdAt
    pricePoints(orderBy: timestamp, orderDirection: asc, first: 1000, where: { timestamp_gte: $since }) {
      yesPrice
      timestamp
    }
  }
}`

/// Same shape the chart already consumes, so the component does not change.
export async function getMarketHistoryFromSubgraph(
  id: number | string,
  range: ChartRange = 'ALL',
): Promise<MarketHistory> {
  const window = RANGE_SECONDS[range]
  const since = window === null ? 0 : Math.floor(Date.now() / 1000) - window

  const data = await query<{
    market: {
      yesPrice: string
      status: string
      tradeCount: number
      createdAt: string
      pricePoints: { yesPrice: string; timestamp: string }[]
    } | null
  }>(HISTORY_QUERY, { id: String(id), since: String(since) })

  if (data.market === null) throw new Error('market not indexed')
  const m = data.market

  const points = m.pricePoints.map((p) => ({ t: Number(p.timestamp) * 1000, p: Number(p.yesPrice) }))
  // A market with no trades in the window still needs a flat line to render, and its opening
  // price is 0.5 by construction (the FPMM is funded balanced).
  if (points.length === 0) {
    points.push({ t: Number(m.createdAt) * 1000, p: Number(m.yesPrice) })
  }

  return {
    id: Number(id),
    range,
    current: Number(m.yesPrice),
    resolved: m.status === 'RESOLVED',
    trades: m.tradeCount,
    points,
  }
}

export interface LeaderboardRow {
  address: string
  volumeUSDC: number
  realizedPnlUSDC: number
  tradeCount: number
  marketsTraded: number
}

const LEADERBOARD_QUERY = `query Leaderboard($first: Int!) {
  traders(orderBy: realizedPnlUSDC, orderDirection: desc, first: $first, where: { tradeCount_gt: 0 }) {
    id
    volumeUSDC
    realizedPnlUSDC
    tradeCount
    marketsTraded
  }
}`

/// Cross-market PnL ranking. Computed in the subgraph mappings with average-cost accounting —
/// the backend never had this, it would have needed its own position bookkeeping.
export async function getLeaderboard(first = 20): Promise<LeaderboardRow[]> {
  const data = await query<{
    traders: {
      id: string
      volumeUSDC: string
      realizedPnlUSDC: string
      tradeCount: number
      marketsTraded: number
    }[]
  }>(LEADERBOARD_QUERY, { first })

  return data.traders.map((t) => ({
    address: t.id,
    volumeUSDC: Number(t.volumeUSDC),
    realizedPnlUSDC: Number(t.realizedPnlUSDC),
    tradeCount: t.tradeCount,
    marketsTraded: t.marketsTraded,
  }))
}

export interface IndexedStats {
  marketCount: number
  resolvedMarketCount: number
  tradeCount: number
  traderCount: number
  volumeUSDC: number
  aiProposalCount: number
  challengeCount: number
  /// Head block the subgraph has indexed — proof to a viewer that the data is live.
  block: number
}

const STATS_QUERY = `query Stats {
  global(id: "global") {
    marketCount
    resolvedMarketCount
    tradeCount
    traderCount
    volumeUSDC
    aiProposalCount
    challengeCount
  }
  _meta { block { number } }
}`

export async function getIndexedStats(): Promise<IndexedStats | null> {
  const data = await query<{
    global: {
      marketCount: number
      resolvedMarketCount: number
      tradeCount: number
      traderCount: number
      volumeUSDC: string
      aiProposalCount: number
      challengeCount: number
    } | null
    _meta: { block: { number: number } }
  }>(STATS_QUERY)

  if (data.global === null) return null
  return {
    marketCount: data.global.marketCount,
    resolvedMarketCount: data.global.resolvedMarketCount,
    tradeCount: data.global.tradeCount,
    traderCount: data.global.traderCount,
    volumeUSDC: Number(data.global.volumeUSDC),
    aiProposalCount: data.global.aiProposalCount,
    challengeCount: data.global.challengeCount,
    block: data._meta.block.number,
  }
}