// Thin client for the Fastify backend (`backend/`). These flows need server
// secrets (deployer key, Anthropic key, file stores) so they cannot run in this SPA.
//
// In dev, Vite proxies `/api/*` to the backend (see vite.config.ts). Override
// the target with VITE_API_BASE (e.g. an absolute URL) when deploying.
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export class ApiUnavailableError extends Error {
  constructor(message = 'Backend API is not reachable. Start the backend server (npm start in /backend).') {
    super(message)
    this.name = 'ApiUnavailableError'
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    // Network error / proxy target down.
    throw new ApiUnavailableError()
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as any)?.error ?? `${path} failed (${res.status})`)
  return body as T
}

// POST /api/create-market — deploys a real CTF/FPMM market (creator role required).
export interface PriceConfig { asset: 'ETH' | 'BTC' | 'LINK'; comparator: 'above' | 'below'; threshold: number }
export function createMarket(input: {
  question: string; description?: string; category?: string; closeTimeDays?: number;
  closeTimeTs?: number; priceConfig?: PriceConfig; creator?: string
}) {
  return apiFetch<{ address: string; question: string; id: number; explorer: string; deployTx: string }>(
    '/api/create-market',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export interface MarketComment { id: string; address: string; name: string; avatar: string; verified: boolean; text: string; ts: number }
export interface UserPost {
  id: string; address: string; name: string; avatar: string; verified: boolean; text: string; ts: number
  likes?: number; liked?: boolean; comments?: number; recentComments?: MarketComment[]
}
export interface Mention extends UserPost { kind: 'post' | 'comment'; marketId?: number }

export function createPost(input: { address: string; text: string }) {
  return apiFetch<{ ok: boolean; post: UserPost }>('/api/post', { method: 'POST', body: JSON.stringify(input) })
}
export function getPosts(author?: string, limit = 30, viewer?: string) {
  const q = new URLSearchParams()
  if (author) q.set('author', author)
  q.set('limit', String(limit))
  if (viewer) q.set('viewer', viewer)
  return apiFetch<{ posts: UserPost[] }>(`/api/posts?${q}`)
}
export function togglePostLike(address: string, postId: string) {
  return apiFetch<{ liked: boolean; count: number }>('/api/post-like', { method: 'POST', body: JSON.stringify({ address, postId }) })
}
export function getPostComments(postId: string) {
  return apiFetch<{ comments: MarketComment[] }>(`/api/post-comments/${postId}`)
}
export function postPostComment(input: { address: string; postId: string; text: string }) {
  return apiFetch<{ ok: boolean; count: number; comment: MarketComment }>('/api/post-comment', { method: 'POST', body: JSON.stringify(input) })
}
export function getLikedMarketIds(address: string) {
  return apiFetch<{ marketIds: number[] }>(`/api/liked/${address}`)
}
export function getMentions(name: string) {
  return apiFetch<{ mentions: Mention[] }>(`/api/mentions/${encodeURIComponent(name)}`)
}
export function getComments(marketId: number | string) {
  return apiFetch<{ comments: MarketComment[] }>(`/api/comments/${marketId}`)
}
export function postComment(input: { address: string; marketId: number | string; text: string }) {
  return apiFetch<{ ok: boolean; count: number }>('/api/comment', { method: 'POST', body: JSON.stringify(input) })
}

export interface ChainlinkPrice { asset: string; price: number; feed: string; updatedAt: number; network: string; explorer: string }
export function getChainlinkPrice(asset: string) {
  return apiFetch<ChainlinkPrice>(`/api/chainlink/${asset}`)
}

// ---- Market price history (chart) ----
export type ChartRange = '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL'
// `points` is ascending by time; `t` = ms epoch, `p` = YES probability (0..1).
export interface MarketHistory { id: number; range: ChartRange; current: number; resolved: boolean; trades: number; points: { t: number; p: number }[] }
export function getMarketHistory(id: number | string, range: ChartRange = 'ALL') {
  return apiFetch<MarketHistory>(`/api/markets/${id}/history?range=${range}`)
}

// `creator` is an admin-granted role (World ID verify = just the checkmark).
export interface PublicUser { name: string; address: string; bio?: string; avatar?: string; verified: boolean; creator?: boolean; followers?: number; createdAt: number }
export interface UserMarket { id: number; question: string; priceYes: number; volume: number; resolved: boolean }
export function getUser(key: string) {
  return apiFetch<{ user: PublicUser; markets: UserMarket[] }>(`/api/user/${key}`)
}

// profile (settings)
export function getMe(address: string) {
  return apiFetch<{ user: { name: string; address: string; bio?: string; avatar?: string; verified: boolean; creator?: boolean } | null }>(`/api/me?address=${address}`)
}
export function updateProfile(input: { address: string; name?: string; bio?: string; avatar?: string }) {
  return apiFetch<{ ok: boolean; user: any }>('/api/profile', { method: 'POST', body: JSON.stringify(input) })
}

// POST /api/dotation — funds a freshly-logged-in embedded wallet with gas money.
export function dotation(address: string) {
  return apiFetch<{ funded?: boolean; skipped?: boolean; hash?: string; amount?: number; balance?: number }>(
    '/api/dotation',
    { method: 'POST', body: JSON.stringify({ address }) },
  )
}

// ---- Likes (markets) ----
export function toggleLike(address: string, marketId: number | string) {
  return apiFetch<{ liked: boolean; count: number }>('/api/like', {
    method: 'POST',
    body: JSON.stringify({ address, marketId }),
  })
}
export function getLikes(marketId: number | string, address?: string) {
  return apiFetch<{ count: number; liked: boolean }>(`/api/likes/${marketId}${address ? `?address=${address}` : ''}`)
}

// ---- Follows (subscribe to creators; `target` is a name OR an address) ----
export function toggleFollow(follower: string, target: string) {
  return apiFetch<{ following: boolean; followers: number }>('/api/follow', {
    method: 'POST',
    body: JSON.stringify({ follower, target }),
  })
}
export function getFollows(key: string, address?: string) {
  return apiFetch<{ followers: number; following: boolean }>(`/api/follows/${key}${address ? `?address=${address}` : ''}`)
}
export interface FollowedUser { name: string; address: string; avatar: string; verified: boolean }
export function getFollowing(address: string) {
  return apiFetch<{ following: FollowedUser[] }>(`/api/following/${address}`)
}

// ---- Activity feed (people's trades + oracle resolutions, from the indexer) ----
export interface ActivityItem {
  id: string
  ts: number
  kind: 'trade' | 'agent' | 'resolution'
  user?: string
  marketId?: number
  marketQuestion?: string
  outcome?: number // trades: slot 0 = NO, 1 = YES; resolutions: 0 = NO, 1 = YES, 2 = INVALID
  amountUsdc?: number
  tx?: string
}
export function getActivityFeed() {
  return apiFetch<{ feed: ActivityItem[] }>('/api/feed')
}

// ---- Admin (hidden /admin page; shared secret in the x-admin-secret header) ----
export interface AdminCreator { name: string; address: string; verified: boolean }
export function adminListCreators(secret: string) {
  return apiFetch<{ creators: AdminCreator[] }>('/api/admin/creators', {
    headers: { 'x-admin-secret': secret },
  })
}
export function adminSetCreator(secret: string, address: string, grant: boolean) {
  return apiFetch<{ ok: boolean; address: string; name: string; creator: boolean }>('/api/admin/creator', {
    method: 'POST',
    headers: { 'x-admin-secret': secret },
    body: JSON.stringify({ address, grant }),
  })
}

// ---- World ID ----
export async function verifyStatus(address: string): Promise<boolean> {
  try {
    const b = await apiFetch<{ verified: boolean }>(`/api/verify-proof?address=${address}`)
    return !!b.verified
  } catch {
    return false
  }
}

export function submitProof(body: { rp_id?: string; idkitResponse: unknown; walletAddress?: string }) {
  return apiFetch<{ success: boolean; alreadyVerified?: boolean }>('/api/verify-proof', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export interface Resolution {
  id: number
  verdict: 'YES' | 'NO'
  rationale: string
  ethPrice?: number
  tx?: string
  model?: string
  oracle?: 'chainlink' | 'claude'
  at?: string
}

// GET /api/proposal/[id] — optimistic-settler proposal state for the challenge window.
export interface ProposalState {
  status: 'none' | 'proposed' | 'challenged' | 'settled'
  outcome: number | null // 0 = NO, 1 = YES, 2 = INVALID
  counterOutcome: number | null
  proposedAt: number | null // ms
  windowEndsAt: number | null // ms
  challenger: string | null
  reason: string | null
  settler: string
}
export async function getProposal(id: number | string): Promise<ProposalState | null> {
  try {
    return await apiFetch<ProposalState>(`/api/proposal/${id}`)
  } catch {
    return null
  }
}

// GET /api/resolution/[id] — stored LLM/CRE resolution (verdict + rationale + tx).
// Returns null if unavailable (no backend / not resolved yet).
export async function getResolution(id: number | string): Promise<Resolution | null> {
  try {
    return await apiFetch<Resolution>(`/api/resolution/${id}`)
  } catch {
    return null
  }
}
