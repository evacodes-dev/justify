import { useCallback, useEffect } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { ensureConfig } from '../lib/markets'

// Central wallet helper over Dynamic. Exposes the connected address, a login
// prompt, and getChainWalletClient() which guarantees an EVM wallet switched to
// the trading chain (from /config) and returns a viem WalletClient for writes.
export function useWallet() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()

  const address = (primaryWallet?.address as `0x${string}` | undefined) ?? undefined
  const isLoggedIn = !!primaryWallet

  // Keep the wallet on the trading chain from the moment of login (otherwise Dynamic
  // stays on whatever network is first in its dashboard list — e.g. a stale Arc entry —
  // and the widget/balances show the wrong chain until the first write).
  useEffect(() => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) return
    ensureConfig()
      .then((cfg) => primaryWallet.switchNetwork(cfg.chainId))
      .catch(() => {}) // network not enabled in Dynamic dashboard — writes will surface it
  }, [primaryWallet])

  const promptLogin = useCallback(() => setShowAuthFlow(true), [setShowAuthFlow])

  const getChainWalletClient = useCallback(async () => {
    if (!primaryWallet) {
      setShowAuthFlow(true)
      throw new Error('Connect your wallet to continue.')
    }
    if (!isEthereumWallet(primaryWallet)) throw new Error('An EVM wallet is required.')
    const cfg = await ensureConfig()
    await primaryWallet.switchNetwork(cfg.chainId)
    return primaryWallet.getWalletClient()
  }, [primaryWallet, setShowAuthFlow])

  return { address, isLoggedIn, primaryWallet, promptLogin, getChainWalletClient }
}
