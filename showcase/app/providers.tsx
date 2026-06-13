"use client";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";

// Arc testnet as a custom EVM network so the embedded wallet can sign Arc txs.
const arcNetwork = {
  blockExplorerUrls: ["https://testnet.arcscan.app"],
  chainId: 5042002,
  chainName: "Arc Testnet",
  iconUrls: [],
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  networkId: 5042002,
  rpcUrls: ["https://rpc.testnet.arc.network"],
  vanityName: "Arc Testnet",
};

// Test 3 / Showcase — Dynamic SDK provider.
export default function Providers({ children }: { children: React.ReactNode }) {
  const environmentId =
    process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "MISSING_ENV_ID";

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
  );
}
