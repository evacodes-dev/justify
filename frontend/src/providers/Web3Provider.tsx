import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import type { ReactNode } from 'react'

// Arc testnet as a custom EVM network so the embedded wallet can sign Arc txs.
// Ported 1:1 from the original Next.js prototype (app/app/providers.tsx).
const arcNetwork = {
  blockExplorerUrls: ['https://testnet.arcscan.app'],
  chainId: 5042002,
  chainName: 'Arc Testnet',
  iconUrls: [],
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USDC', symbol: 'USDC' },
  networkId: 5042002,
  rpcUrls: ['https://rpc.testnet.arc.network'],
  vanityName: 'Arc Testnet',
}

// Dynamic embedded-wallet / auth provider. Wraps the whole app so any component
// can read the logged-in wallet via useDynamicContext().
export default function Web3Provider({ children }: { children: ReactNode }) {
  const environmentId =
    import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID ?? 'MISSING_ENV_ID'

  return (
    <DynamicContextProvider
      settings={{
        environmentId,
        walletConnectors: [EthereumWalletConnectors],
        overrides: { evmNetworks: [arcNetwork] },
      }}
    >
      {children}
    </DynamicContextProvider>
  )
}
