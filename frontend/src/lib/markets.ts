// Live FPMM markets on Arc testnet (deployed via MarketFactory — see
// contracts/deployments/arc-testnet.json). These are REAL on-chain markets with a
// live constant-product price; trades send a real approve+buy via the Dynamic wallet.
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
  tags?: string
  thumb: string
  yesLabel?: string
  noLabel?: string
}

// Seed FPMM markets (Factory ids 0..2). New markets created via /api/create-market
// can be loaded dynamically later; these cover the demo.
export const DEMO_MARKETS: DemoMarket[] = [
  { id: 0, address: '0xccc94f54f25ebfeE04AEeEdbFd4F1e39221526E6', question: 'Will ETH close above $5,000 on 2026-07-01?', emoji: 'Ξ', gradient: 'linear-gradient(135deg,#627eea,#1b1f3b)', author: 'justify', tags: '#crypto #eth', thumb: '/img/ETHfullsize.webp' },
  { id: 2, address: '0x82329d3d14496CEfcBc46c47FF848736FeaC262a', question: 'Will BTC close above $200,000 in 2026?', emoji: '₿', gradient: 'linear-gradient(135deg,#f7931a,#7a3e00)', author: 'justify', tags: '#crypto #btc', thumb: '/img/will-microstrategy-purchase-bitcoin-july-1-7-mzoE5TYk_cCI.webp' },
  { id: 1, address: '0x93773f04Bc513d9eeEE476953c1c83DB76610e62', question: 'Will the Fed cut rates at the July 2026 meeting?', emoji: '🏦', gradient: 'linear-gradient(135deg,#455a64,#15202b)', author: 'justify', tags: '#macro #fed', thumb: '/img/post1.png' },
]

// Map a real on-chain market (+ optional live state) into the existing justify-latest
// `Market` UI shape, so the original components render it unchanged with real data.
export function toUiMarket(
  m: DemoMarket,
  state?: { yesPct: number; total: number; resolved: boolean },
): import('../types').Market {
  const yesPct = state?.yesPct ?? 50
  const total = state?.total ?? 0
  return {
    id: String(m.id),
    title: m.question,
    description: state?.resolved ? 'Resolved · live on Arc' : 'Binary FPMM · live on Arc',
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

// ─── dynamic markets from the backend (real FPMM markets, incl. user-created) ───
export type ApiMarket = {
  id: number; address: `0x${string}`; question: string; metadataURI: string;
  priceYes: number; volume: number; resolved: boolean; outcome?: number; closeTime: number; creator: string; creatorName?: string
}

// Derive a card emoji/thumb/tags from the question + metadata category.
function derive(question: string, category: string): Pick<DemoMarket, 'emoji' | 'gradient' | 'thumb' | 'tags'> {
  const q = `${question} ${category}`.toLowerCase()
  if (/\beth|ethereum\b/.test(q)) return { emoji: 'Ξ', gradient: 'linear-gradient(135deg,#627eea,#1b1f3b)', thumb: '/img/ETHfullsize.webp', tags: '#crypto #eth' }
  if (/\bbtc|bitcoin\b/.test(q)) return { emoji: '₿', gradient: 'linear-gradient(135deg,#f7931a,#7a3e00)', thumb: '/img/will-microstrategy-purchase-bitcoin-july-1-7-mzoE5TYk_cCI.webp', tags: '#crypto #btc' }
  if (/\bsol|solana\b/.test(q)) return { emoji: '◎', gradient: 'linear-gradient(135deg,#14f195,#1b1f3b)', thumb: '/img/post1.png', tags: '#crypto #sol' }
  if (/\bfed|rate|fomc|inflation|cpi\b/.test(q)) return { emoji: '🏦', gradient: 'linear-gradient(135deg,#455a64,#15202b)', thumb: '/img/post1.png', tags: '#macro #fed' }
  if (/\belect|president|vote|poll\b/.test(q)) return { emoji: '🗳️', gradient: 'linear-gradient(135deg,#8e24aa,#311b92)', thumb: '/img/post1.png', tags: '#politics' }
  if (/\bgame|win|cup|match|score|sport\b/.test(q)) return { emoji: '🏆', gradient: 'linear-gradient(135deg,#2e7d32,#1b5e20)', thumb: '/img/post1.png', tags: '#sports' }
  return { emoji: '❓', gradient: 'linear-gradient(135deg,#3949ab,#1a237e)', thumb: '/img/post1.png', tags: category ? `#${category}` : '#market' }
}

export function apiMarketToDemo(m: ApiMarket): DemoMarket {
  let category = 'general'
  try { category = JSON.parse(m.metadataURI || '{}').category || 'general' } catch { /* legacy uri */ }
  return { id: m.id, address: m.address, question: m.question, author: m.creatorName || 'justify', ...derive(m.question, category) }
}

export async function fetchMarkets(): Promise<{ demo: DemoMarket; api: ApiMarket }[]> {
  const base = import.meta.env.VITE_API_BASE ?? ''
  const r = await fetch(`${base}/api/markets`)
  const body = await r.json()
  const list: ApiMarket[] = body.markets ?? []
  return list.map((m) => ({ demo: apiMarketToDemo(m), api: m }))
}

export const USDC_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

// Binary FPMM Market ABI (src/Market.sol). `buy(outcome, amount)`: outcome 1=YES, 0=NO.
// reserves() returns (yes, no); priceYes() is the YES probability scaled to 1e18.
export const MARKET_ABI = [
  { type: 'function', name: 'buy', stateMutability: 'nonpayable', inputs: [{ type: 'uint8', name: 'outcome' }, { type: 'uint256', name: 'amountIn' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'redeem', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'priceYes', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'reserves', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256', name: 'yes' }, { type: 'uint256', name: 'no' }] },
  { type: 'function', name: 'resolved', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'winningOutcome', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'resolutionReason', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'question', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'balances', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'uint8' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'previewPayout', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const
