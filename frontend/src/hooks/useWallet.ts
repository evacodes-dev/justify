import { useCallback } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { ARC } from '../lib/markets'

// Central wallet helper over Dynamic. Exposes the connected address, a login
// prompt, and getArcWalletClient() which guarantees an EVM wallet switched to
// Arc and returns a viem WalletClient ready for arc.ts writes.
export function useWallet() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()

  const address = (primaryWallet?.address as `0x${string}` | undefined) ?? undefined
  const isLoggedIn = !!primaryWallet

  const promptLogin = useCallback(() => setShowAuthFlow(true), [setShowAuthFlow])

  // Mirrors the prototype's trade flow: guard EVM wallet, switch to Arc, then
  // return a viem WalletClient. Throws with a friendly message when not ready.
  const getArcWalletClient = useCallback(async () => {
    if (!primaryWallet) {
      setShowAuthFlow(true)
      throw new Error('Connect your wallet to continue.')
    }
    if (!isEthereumWallet(primaryWallet)) throw new Error('An EVM wallet is required.')
    await primaryWallet.switchNetwork(ARC.chainId)
    return primaryWallet.getWalletClient()
  }, [primaryWallet, setShowAuthFlow])

  return { address, isLoggedIn, primaryWallet, promptLogin, getArcWalletClient }
}
