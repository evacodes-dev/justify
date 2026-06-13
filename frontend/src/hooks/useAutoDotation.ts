import { useEffect, useRef } from 'react'
import { useWallet } from './useWallet'
import { dotation } from '../lib/api'

// When an embedded wallet first appears, fund it once with 0.5 USDC via the
// backend faucet (server-only). Best-effort: silently ignored if the backend
// isn't running — the rest of the app (reads, trading with existing balance)
// still works.
export function useAutoDotation() {
  const { address } = useWallet()
  const done = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!address || done.current.has(address)) return
    done.current.add(address)
    dotation(address).catch(() => {})
  }, [address])
}
