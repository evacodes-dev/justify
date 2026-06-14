import { useCallback, useEffect, useState } from 'react'
import { fetchMarkets, type DemoMarket, type ApiMarket } from '../lib/markets'

export type MarketRow = { demo: DemoMarket; api: ApiMarket }

// Live list of real FPMM markets from the backend (polls every 10s). Includes
// user-created markets, so nothing is hardcoded.
export function useMarkets() {
  const [markets, setMarkets] = useState<MarketRow[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    fetchMarkets()
      .then((m) => { setMarkets(m); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 10000)
    return () => clearInterval(t)
  }, [refresh])

  return { markets, loading, refresh }
}

export function useMarketById(id?: string | number) {
  const { markets, loading } = useMarkets()
  const row = markets.find((m) => String(m.demo.id) === String(id))
  return { row, loading }
}
