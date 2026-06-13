// Live DemoMarket contracts on Arc testnet (deployed from the faucet wallet in
// the original prototype). These are the REAL on-chain markets — trades send a
// real approve+bet via the connected Dynamic wallet.
// Ported from app/app/showcase/demo-markets.ts.
export const ARC = {
  chainId: 5042002,
  rpc: 'https://rpc.testnet.arc.network',
  usdc: '0x3600000000000000000000000000000000000000' as `0x${string}`,
  explorer: 'https://testnet.arcscan.app',
}

export type DemoMarket = {
  id: number
  address: `0x${string}`
  question: string
  emoji: string
  gradient: string
  author?: string
  // Short tags + image thumb for the explore/card UI (justify-latest design).
  tags?: string
  thumb: string
  yesLabel?: string
  noLabel?: string
}

export const DEMO_MARKETS: DemoMarket[] = [
  { id: 1, address: '0x6f314CD6a9A0fc6836F9d960fc694b6e4aE418b7', question: 'Will ETH close above $4000 on Jun 30, 2026?', emoji: 'Ξ', gradient: 'linear-gradient(135deg,#627eea,#1b1f3b)', author: 'justify', tags: '#crypto #eth', thumb: '/img/ETHfullsize.webp' },
  { id: 2, address: '0xDb57F739A59aa9e18a765e8D09F8c82cc6B8229A', question: 'Will BTC close above $200k in 2026?', emoji: '₿', gradient: 'linear-gradient(135deg,#f7931a,#7a3e00)', author: 'justify', tags: '#crypto #btc', thumb: '/img/will-microstrategy-purchase-bitcoin-july-1-7-mzoE5TYk_cCI.webp' },
  { id: 3, address: '0xa21dc273e736848750E105D64846614443070C80', question: 'Will the Fed cut rates at the next meeting?', emoji: '🏦', gradient: 'linear-gradient(135deg,#455a64,#15202b)', author: 'justify', tags: '#macro #fed', thumb: '/img/post1.png' },
]

// Map a real on-chain market (+ optional live state) into the existing
// justify-latest `Market` UI shape, so the original components render it
// unchanged with real data.
export function toUiMarket(
  m: DemoMarket,
  state?: { yesPct: number; total: number; resolved: boolean },
): import('../types').Market {
  const yesPct = state?.yesPct ?? 50
  const total = state?.total ?? 0
  return {
    id: String(m.id),
    title: m.question,
    description: state?.resolved ? 'Resolved · live on Arc' : 'Binary market · live on Arc',
    thumb: m.thumb,
    volume: `$${total.toFixed(2)} Vol.`,
    endTime: m.tags ?? '',
    chance: yesPct,
    yesLabel: m.yesLabel ?? 'Yes',
    noLabel: m.noLabel ?? 'No',
    yesPrice: yesPct / 100,
    noPrice: (100 - yesPct) / 100,
  }
}

export const getMarket = (id: number | string) =>
  DEMO_MARKETS.find((m) => String(m.id) === String(id))

export const getMarketByAddress = (address: string) =>
  DEMO_MARKETS.find((m) => m.address.toLowerCase() === address.toLowerCase())

// Minimal ABIs (ported verbatim from demo-markets.ts).
export const USDC_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

export const MARKET_ABI = [
  { type: 'function', name: 'bet', stateMutability: 'nonpayable', inputs: [{ type: 'uint8', name: 'side' }, { type: 'uint256', name: 'amount' }], outputs: [] },
  { type: 'function', name: 'resolve', stateMutability: 'nonpayable', inputs: [{ type: 'uint8' }], outputs: [] },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'resolved', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'outcome', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'question', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'pools', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256', name: 'no' }, { type: 'uint256', name: 'yes' }] },
  { type: 'function', name: 'stakeOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256', name: 'no' }, { type: 'uint256', name: 'yes' }] },
  { type: 'function', name: 'previewPayout', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const
