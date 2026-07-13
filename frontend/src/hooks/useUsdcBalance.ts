import { useCallback, useEffect, useState } from 'react'
import { usdcBalance } from '../lib/arc'

// Reads the connected wallet's USDC (ERC-20) balance on the trading chain.
export function useUsdcBalance(address?: `0x${string}`) {
  const [balance, setBalance] = useState<number | null>(null)

  const refresh = useCallback(() => {
    if (!address) {
      setBalance(null)
      return
    }
    usdcBalance(address)
      .then(setBalance)
      .catch(() => {})
  }, [address])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { balance, refresh }
}
