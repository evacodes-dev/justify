// EIP-191 session auth: on the first identity write the wallet signs ONE login
// message ("Justify sign-in"); the backend returns a 30-day token which we cache
// per-address in localStorage and attach as x-auth-token on every social write.
// No popup spam — one signature per device per month.

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

let signerAddress = ''
let signMessage: ((message: string) => Promise<string>) | null = null

/// Called from useWallet whenever the connected wallet changes.
export function configureAuthSigner(address: string | undefined, sign: ((m: string) => Promise<string>) | null) {
  signerAddress = address?.toLowerCase() ?? ''
  signMessage = sign
}

const storageKey = (a: string) => `justify.auth.${a}`

function cachedToken(a: string): string | null {
  const t = localStorage.getItem(storageKey(a))
  if (!t) return null
  try {
    const payload = JSON.parse(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')))
    // refresh a day before expiry
    if (Number(payload.exp) - Date.now() < 86_400_000) return null
    return t
  } catch {
    return null
  }
}

let pending: Promise<string> | null = null

/// Token for the connected wallet — signs the login message on first use.
export async function ensureAuthToken(): Promise<string | null> {
  if (!signerAddress || !signMessage) return null
  const cached = cachedToken(signerAddress)
  if (cached) return cached
  if (pending) return pending // de-dupe concurrent writes racing for the first signature
  pending = (async () => {
    const ts = Date.now()
    const message = `Justify sign-in\naddress: ${signerAddress}\nts: ${ts}`
    const signature = await signMessage!(message)
    const res = await fetch(`${API_BASE}/api/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: signerAddress, ts, signature }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((body as any)?.error ?? 'Sign-in failed')
    localStorage.setItem(storageKey(signerAddress), body.token)
    return body.token as string
  })()
  try {
    return await pending
  } finally {
    pending = null
  }
}

export function authHeaders(): Record<string, string> {
  const t = signerAddress ? localStorage.getItem(storageKey(signerAddress)) : null
  return t ? { 'x-auth-token': t } : {}
}
