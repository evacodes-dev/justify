import { useCallback, useEffect, useState } from 'react'
import { readShares } from '../lib/arc'
import type { ApiMarket } from '../lib/markets'

// Polls the user's ERC-1155 outcome-share balances (Gnosis CTF) for one market,
// refreshing every 8s. Price/volume/resolved come from /api/markets (useMarkets).
export function useCtfShares(market?: Pick<ApiMarket, 'posYes' | 'posNo'> | null, user?: `0x${string}`) {
  const [shares, setShares] = useState<{ yesShares: number; noShares: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const posYes = market?.posYes ?? null
  const posNo = market?.posNo ?? null

  const refresh = useCallback(() => {
    if (!posYes || !posNo || !user) { setShares(null); return }
    setLoading(true)
    readShares({ posYes, posNo }, user)
      .then(setShares)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [posYes, posNo, user])

  useEffect(() => {
    refresh()
    if (!posYes || !user) return
    const t = setInterval(refresh, 8000)
    return () => clearInterval(t)
  }, [refresh, posYes, user])

  return { shares, loading, refresh }
}
