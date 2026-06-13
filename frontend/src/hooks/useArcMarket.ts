import { useCallback, useEffect, useState } from 'react'
import { readMarket, type MarketState } from '../lib/arc'

// Polls live on-chain state (pools, odds, your stake, resolved) for one Arc
// market, refreshing every 8s — same cadence as the prototype's LiveMarketCard.
export function useArcMarket(address?: `0x${string}`, user?: `0x${string}`) {
  const [state, setState] = useState<MarketState | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    if (!address) return
    setLoading(true)
    readMarket(address, user)
      .then(setState)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address, user])

  useEffect(() => {
    refresh()
    if (!address) return
    const t = setInterval(refresh, 8000)
    return () => clearInterval(t)
  }, [refresh, address])

  return { state, loading, refresh }
}
