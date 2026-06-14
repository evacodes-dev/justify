import { useQuery } from '@tanstack/react-query'
import { fetchMarkets, type DemoMarket, type ApiMarket } from '../lib/markets'

export type MarketRow = { demo: DemoMarket; api: ApiMarket }

// Live list of real FPMM markets from the backend (cached + polled every 10s via
// react-query, so multiple components share one request). Includes user-created
// markets, so nothing is hardcoded.
export function useMarkets() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['markets'],
    queryFn: fetchMarkets,
    refetchInterval: 10_000,
  })
  return { markets: data ?? [], loading: isLoading, refresh: () => { void refetch() } }
}

export function useMarketById(id?: string | number) {
  const { markets, loading } = useMarkets()
  const row = markets.find((m) => String(m.demo.id) === String(id))
  return { row, loading }
}
