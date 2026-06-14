import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getMarketHistory, type ChartRange } from '../lib/api'

// Backend price series for one market, cached + polled every 10s via react-query.
// Disabled (no request) when id is absent — the showcase trade pages have no real
// on-chain market. keepPreviousData keeps the old series on screen while a range
// toggle refetches, so the chart never flickers to empty.
export function useMarketHistory(id?: number | string, range: ChartRange = 'ALL') {
  return useQuery({
    queryKey: ['market-history', String(id), range],
    queryFn: () => getMarketHistory(id!, range),
    enabled: id != null,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  })
}
