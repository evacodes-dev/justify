// Thin client for the server-only flows that still live in the Next.js `app`
// backend (create-market, dotation, …). These need server secrets (faucet key,
// Anthropic key, file stores) so they cannot run in this SPA.
//
// In dev, Vite proxies `/api/*` to the backend (see vite.config.ts). Override
// the target with VITE_API_BASE (e.g. an absolute URL) when deploying.
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export class ApiUnavailableError extends Error {
  constructor(message = 'Backend API is not reachable. Start the `app` Next.js server (npm run dev in /app).') {
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

// POST /api/create-market — deploys a real FPMM market on Arc.
export function createMarket(input: {
  question: string; description?: string; category?: string; closeTimeDays?: number; creator?: string; countries?: string[]
}) {
  return apiFetch<{ address: string; question: string; id: number; explorer: string; deployTx: string }>(
    '/api/create-market',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export interface PublicUser { name: string; address: string; bio?: string; avatar?: string; verified: boolean; createdAt: number }
export interface UserMarket { id: number; question: string; priceYes: number; volume: number; resolved: boolean }
export function getUser(key: string) {
  return apiFetch<{ user: PublicUser; markets: UserMarket[] }>(`/api/user/${key}`)
}

// profile (settings)
export function getMe(address: string) {
  return apiFetch<{ user: { name: string; address: string; bio?: string; avatar?: string; verified: boolean } | null }>(`/api/me?address=${address}`)
}
export function updateProfile(input: { address: string; name?: string; bio?: string; avatar?: string }) {
  return apiFetch<{ ok: boolean; user: any }>('/api/profile', { method: 'POST', body: JSON.stringify(input) })
}

// POST /api/dotation — funds a freshly-logged-in embedded wallet with 0.5 USDC.
export function dotation(address: string) {
  return apiFetch<{ funded?: boolean; skipped?: boolean; hash?: string; amount?: number; balance?: number }>(
    '/api/dotation',
    { method: 'POST', body: JSON.stringify({ address }) },
  )
}

// ---- Agents (TZ Part 3) ----
export interface PublicAgent {
  id: string
  name: string
  ens?: string
  address: `0x${string}`
  strategy: string
  preset: string
  owner?: string
  humanId?: string
  erc8004Id?: string
  record?: { w: number; l: number }
  public?: boolean // false = draft, awaiting World ID confirmation to go public
}

// Pass `owner` to also receive that owner's own drafts (not visible to others).
export function listAgents(owner?: string) {
  const q = owner ? `?owner=${owner}` : ''
  return apiFetch<{ agents: PublicAgent[] }>(`/api/agents${q}`)
}

export function createAgent(input: { name: string; preset?: string; owner?: string }) {
  return apiFetch<{ agent: PublicAgent; fundTx?: string }>('/api/agents', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// Publish a draft bot — confirmed with a World ID proof (or dev bypass on the backend).
export function publishAgent(id: string, body: { owner?: string; rp_id?: string; idkitResponse?: unknown }) {
  return apiFetch<{ agent: PublicAgent; published?: boolean; alreadyPublic?: boolean }>(`/api/agents/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ---- Reasoning feed (TZ Part 3 wow-feature) ----
export interface FeedPost {
  ts: number
  agent: string
  action: 'bet' | 'skip' | 'request_approval'
  marketId?: number
  marketQuestion?: string
  side?: 'YES' | 'NO'
  amountUsdc?: number
  confidence?: number
  impliedProb?: number
  estProb?: number
  edge?: number
  reasoning: string
  dataUsed?: { label: string; value: string; source: string }[]
  humanBacked?: boolean
  tx?: string
  status?: string
}

export function listFeed() {
  return apiFetch<{ feed: FeedPost[] }>('/api/agent/tick')
}

export function runAgentTick(agentId?: string) {
  return apiFetch<FeedPost>('/api/agent/tick', { method: 'POST', body: JSON.stringify({ agentId }) })
}

// ---- Human-in-the-loop approvals (TZ Part 3) ----
export interface Approval {
  id: string
  agentId: string
  agent: string
  owner: string
  marketId: number
  marketQuestion: string
  side: 'YES' | 'NO'
  amountUsdc: number
  reasoning: string
  ts: number
  status: 'pending' | 'approved' | 'rejected'
  tx?: string
}

export function listApprovals(owner?: string) {
  const q = owner ? `?owner=${owner}` : ''
  return apiFetch<{ approvals: Approval[] }>(`/api/approvals${q}`)
}

export function resolveApproval(id: string, action: 'approve' | 'reject', body: Record<string, unknown> = {}) {
  return apiFetch<{ status: string; tx?: string; txUrl?: string }>(`/api/approvals/${id}`, {
    method: 'POST',
    body: JSON.stringify({ action, ...body }),
  })
}

// ---- World ID (TZ Part 2) ----
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
  at?: string
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
