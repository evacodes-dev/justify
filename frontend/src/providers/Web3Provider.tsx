import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import type { ReactNode } from 'react'

// Trading chains for the embedded wallet. Base Sepolia (beta) first = default network;
// Base mainnet listed so the launch is a config flip, not a code change.
const baseSepolia = {
  blockExplorerUrls: ['https://sepolia.basescan.org'],
  chainId: 84532,
  chainName: 'Base Sepolia',
  iconUrls: ['https://app.dynamic.xyz/assets/networks/base.svg'],
  name: 'Base Sepolia',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  networkId: 84532,
  rpcUrls: ['https://sepolia.base.org'],
  vanityName: 'Base Sepolia',
}

const baseMainnet = {
  blockExplorerUrls: ['https://basescan.org'],
  chainId: 8453,
  chainName: 'Base',
  iconUrls: ['https://app.dynamic.xyz/assets/networks/base.svg'],
  name: 'Base',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  networkId: 8453,
  rpcUrls: ['https://mainnet.base.org'],
  vanityName: 'Base',
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
        overrides: { evmNetworks: [baseSepolia, baseMainnet] },
      }}
    >
      {children}
    </DynamicContextProvider>
  )
}
