// On-chain trading layer: audited Gnosis CTF (ConditionalTokens, ERC-1155) +
// FixedProductMarketMaker on Base. `market.address` from /api/markets is the FPMM.
// Chain + contract addresses come from the backend `GET /config`; the defaults below
// mirror contracts/deployments/base-sepolia.json so reads work before it answers.
export interface ChainConfig {
  chainId: number
  rpc: string
  explorer: string
  registry?: `0x${string}`
  ctf: `0x${string}`
  resolver?: `0x${string}`
  settler?: `0x${string}`
  usdc: `0x${string}`
  usdcDecimals: number
}

export const CHAIN: ChainConfig = {
  chainId: 84532,
  rpc: 'https://sepolia.base.org',
  explorer: 'https://sepolia.basescan.org',
  ctf: '0x73FA4E26d22b4e2f1B68dD74b56bca62bDAdfbd7',
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  usdcDecimals: 6,
}

let configPromise: Promise<ChainConfig> | null = null
// Fetch /config once and merge into CHAIN (mutated in place so sync readers like
// txUrl pick up the deployed values after the first await).
export function ensureConfig(): Promise<ChainConfig> {
  if (!configPromise) {
    const base = import.meta.env.VITE_API_BASE ?? ''
    configPromise = fetch(`${base}/api/config`)
      .then((r) => r.json())
      .then((c) => Object.assign(CHAIN, c))
      .catch(() => CHAIN) // backend down — keep deployment defaults
  }
  return configPromise
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
  category?: string
}

// Map a real on-chain market (+ optional live state) into the existing justify-latest
// `Market` UI shape, so the original components render it unchanged with real data.
export function toUiMarket(
  m: DemoMarket,
  state?: { yesPct: number; total: number; resolved: boolean; likes?: number },
): import('../types').Market {
  const yesPct = state?.yesPct ?? 50
  const total = state?.total ?? 0
  return {
    id: String(m.id),
    title: m.question,
    description: state?.resolved ? 'Resolved · on-chain' : 'Binary FPMM · on-chain',
    thumb: m.thumb,
    volume: `$${total.toFixed(2)} Vol.`,
    endTime: m.tags ?? '',
    chance: yesPct,
    yesLabel: m.yesLabel ?? 'Yes',
    noLabel: m.noLabel ?? 'No',
    yesPrice: yesPct / 100,
    noPrice: (100 - yesPct) / 100,
    likes: state?.likes ?? 0,
  }
}

// ─── dynamic markets from the backend (real CTF/FPMM markets, incl. user-created) ───
export type ApiMarket = {
  id: number; address: `0x${string}`; question: string; metadataURI: string;
  priceYes: number; volume: number; resolved: boolean; outcome?: number; closeTime: number;
  creator: string; creatorName?: string; likes: number;
  // Gnosis CTF fields (null on legacy rows): ERC-1155 position ids are decimal strings.
  conditionId: `0x${string}` | null; posYes: string | null; posNo: string | null
}

// Derive a card emoji/thumb/tags from the question + metadata category.
function derive(question: string, category: string): Pick<DemoMarket, 'emoji' | 'gradient' | 'thumb' | 'tags'> {
  const q = `${question} ${category}`.toLowerCase()
  if (/\beth|ethereum\b/.test(q)) return { emoji: 'Ξ', gradient: 'linear-gradient(135deg,#627eea,#1b1f3b)', thumb: '/img/ETHfullsize.webp', tags: '#crypto #eth' }
  if (/\bbtc|bitcoin\b/.test(q)) return { emoji: '₿', gradient: 'linear-gradient(135deg,#f7931a,#7a3e00)', thumb: '/img/will-microstrategy-purchase-bitcoin-july-1-7-mzoE5TYk_cCI.webp', tags: '#crypto #btc' }
  if (/\bsol|solana\b/.test(q)) return { emoji: '◎', gradient: 'linear-gradient(135deg,#14f195,#1b1f3b)', thumb: '/img/post1.png', tags: '#crypto #sol' }
  if (/\bfed|rate|fomc|inflation|cpi\b/.test(q)) return { emoji: '%', gradient: 'linear-gradient(135deg,#455a64,#15202b)', thumb: '/img/post1.png', tags: '#macro #fed' }
  if (/\belect|president|vote|poll\b/.test(q)) return { emoji: '▣', gradient: 'linear-gradient(135deg,#8e24aa,#311b92)', thumb: '/img/post1.png', tags: '#politics' }
  if (/\bgame|win|cup|match|score|sport\b/.test(q)) return { emoji: '◈', gradient: 'linear-gradient(135deg,#2e7d32,#1b5e20)', thumb: '/img/post1.png', tags: '#sports' }
  return { emoji: '◆', gradient: 'linear-gradient(135deg,#3949ab,#1a237e)', thumb: '/img/post1.png', tags: category ? `#${category}` : '#market' }
}

export function apiMarketToDemo(m: ApiMarket): DemoMarket {
  let category = 'general'
  try {
    const meta = JSON.parse(m.metadataURI || '{}')
    category = meta.category || 'general'
  } catch { /* legacy uri */ }
  return { id: m.id, address: m.address, question: m.question, author: m.creatorName || 'justify', category, ...derive(m.question, category) }
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

// Gnosis FixedProductMarketMaker. outcomeIndex: 0 = NO, 1 = YES.
export const FPMM_ABI = [
  { type: 'function', name: 'calcBuyAmount', stateMutability: 'view', inputs: [{ type: 'uint256', name: 'investmentAmount' }, { type: 'uint256', name: 'outcomeIndex' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'calcSellAmount', stateMutability: 'view', inputs: [{ type: 'uint256', name: 'returnAmount' }, { type: 'uint256', name: 'outcomeIndex' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'buy', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'investmentAmount' }, { type: 'uint256', name: 'outcomeIndex' }, { type: 'uint256', name: 'minOutcomeTokensToBuy' }], outputs: [] },
  { type: 'function', name: 'sell', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'returnAmount' }, { type: 'uint256', name: 'outcomeIndex' }, { type: 'uint256', name: 'maxOutcomeTokensToSell' }], outputs: [] },
] as const

// Gnosis ConditionalTokens (ERC-1155 positions).
export const CTF_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'setApprovalForAll', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [] },
  { type: 'function', name: 'isApprovedForAll', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'redeemPositions', stateMutability: 'nonpayable', inputs: [{ type: 'address', name: 'collateralToken' }, { type: 'bytes32', name: 'parentCollectionId' }, { type: 'bytes32', name: 'conditionId' }, { type: 'uint256[]', name: 'indexSets' }], outputs: [] },
] as const
