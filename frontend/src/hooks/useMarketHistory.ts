import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getMarketHistory, type ChartRange } from '../lib/api'
import { getMarketHistoryFromSubgraph, hasSubgraph } from '../lib/subgraph'

// Price series for one market, cached + polled every 10s via react-query.
//
// Served from The Graph when a subgraph endpoint is configured: the series it returns is the
// pool-derived YES price recorded at every trade, computed in the subgraph's mappings. The
// backend route stays as the fallback so the app runs without an indexer, and so a subgraph
// hiccup degrades the chart instead of emptying it.
//
// Disabled (no request) when id is absent — the showcase trade pages have no real on-chain
// market. keepPreviousData keeps the old series on screen while a range toggle refetches, so the
// chart never flickers to empty.
export function useMarketHistory(id?: number | string, range: ChartRange = 'ALL') {
  return useQuery({
    queryKey: ['market-history', String(id), range, hasSubgraph()],
    queryFn: async () => {
      if (hasSubgraph()) {
        try {
          return await getMarketHistoryFromSubgraph(id!, range)
        } catch (e) {
          console.warn('[subgraph] history unavailable, falling back to backend', e)
        }
      }
      return getMarketHistory(id!, range)
    },
    enabled: id != null,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  })
}
