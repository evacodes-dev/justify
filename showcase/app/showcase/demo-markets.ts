// Live DemoMarket contracts on Arc testnet (deployed from the faucet wallet).
// These are the 3 REAL markets in the showcase — trades send real approve+bet.
export const ARC = {
  chainId: 5042002,
  rpc: "https://rpc.testnet.arc.network",
  usdc: "0x3600000000000000000000000000000000000000" as `0x${string}`,
  explorer: "https://testnet.arcscan.app",
};

export type DemoMarket = {
  id: number;
  address: `0x${string}`;
  question: string;
  emoji: string;
  gradient: string;
  author?: string;
};

export const DEMO_MARKETS: DemoMarket[] = [
  { id: 1, address: "0x6f314CD6a9A0fc6836F9d960fc694b6e4aE418b7", question: "Will ETH close above $4000 on Jun 30, 2026?", emoji: "Ξ", gradient: "linear-gradient(135deg,#627eea,#1b1f3b)", author: "justify.eth" },
  { id: 2, address: "0xDb57F739A59aa9e18a765e8D09F8c82cc6B8229A", question: "Will BTC close above $200k in 2026?", emoji: "₿", gradient: "linear-gradient(135deg,#f7931a,#7a3e00)", author: "justify.eth" },
  { id: 3, address: "0xa21dc273e736848750E105D64846614443070C80", question: "Will the Fed cut rates at the next meeting?", emoji: "🏦", gradient: "linear-gradient(135deg,#455a64,#15202b)", author: "justify.eth" },
];

// Minimal ABIs
export const USDC_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const MARKET_ABI = [
  { type: "function", name: "bet", stateMutability: "nonpayable", inputs: [{ type: "uint8", name: "side" }, { type: "uint256", name: "amount" }], outputs: [] },
  { type: "function", name: "resolve", stateMutability: "nonpayable", inputs: [{ type: "uint8" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "resolved", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "outcome", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "question", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "pools", stateMutability: "view", inputs: [], outputs: [{ type: "uint256", name: "no" }, { type: "uint256", name: "yes" }] },
  { type: "function", name: "stakeOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256", name: "no" }, { type: "uint256", name: "yes" }] },
  { type: "function", name: "previewPayout", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
