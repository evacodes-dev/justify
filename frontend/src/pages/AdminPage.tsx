import { useCallback, useEffect, useState, type FormEvent } from 'react'
import VerifiedBadge from '../components/common/VerifiedBadge'
import { adminListCreators, adminSetCreator, type AdminCreator } from '../lib/api'

const SECRET_KEY = 'justify.adminSecret'
const isAddr = (a: string) => /^0x[a-fA-F0-9]{40}$/.test(a)

// Hidden admin page (no nav entry) — the ONLY way to grant/revoke the creator role.
// The shared secret is kept in localStorage and sent as the x-admin-secret header.
// Works against any backend that has ADMIN_SECRET set; shows the API error otherwise.
export default function AdminPage() {
  const [secret, setSecret] = useState(() => localStorage.getItem(SECRET_KEY) ?? '')
  const [creators, setCreators] = useState<AdminCreator[] | null>(null)
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async (s: string) => {
    if (!s) { setCreators(null); return }
    setErr('')
    try {
      const r = await adminListCreators(s)
      setCreators(r.creators)
    } catch (e: any) {
      setCreators(null)
      setErr(e?.message || 'Failed to load creators')
    }
  }, [])

  useEffect(() => { void load(secret) }, [load]) // eslint-disable-line react-hooks/exhaustive-deps -- load once with the stored secret

  const saveSecret = (e: FormEvent) => {
    e.preventDefault()
    localStorage.setItem(SECRET_KEY, secret)
    void load(secret)
  }

  const setRole = async (addr: string, grant: boolean) => {
    setBusy(true); setErr(''); setNotice('')
    try {
      const r = await adminSetCreator(secret, addr, grant)
      setNotice(`${r.name || r.address}: creator ${r.creator ? 'granted' : 'revoked'}`)
      setAddress('')
      await load(secret)
    } catch (e: any) {
      setErr(e?.message || 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const grant = (e: FormEvent) => {
    e.preventDefault()
    if (!isAddr(address)) { setErr('Enter a valid 0x address (the user must have verified with World ID first).'); return }
    void setRole(address, true)
  }

  return (
    <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12 mx-auto">
      <div className="main-content p-lg-3 border-start border-end">
        <div className="d-flex align-items-center mb-4">
          <span className="material-icons text-primary me-2">admin_panel_settings</span>
          <h4 className="mb-0 fw-bold text-body">Admin — creator roles</h4>
        </div>

        <form className="bg-glass p-4 rounded-4 shadow-sm mb-3" onSubmit={saveSecret}>
          <div className="form-floating mb-2">
            <input
              type="password" className="form-control rounded-4 bg-glass" id="as"
              value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="secret"
            />
            <label htmlFor="as" className="text-muted">ADMIN SECRET (stored in this browser)</label>
          </div>
          <button type="submit" className="btn btn-outline-primary rounded-5 fw-bold px-4">Save & load</button>
        </form>

        <form className="bg-glass p-4 rounded-4 shadow-sm mb-3" onSubmit={grant}>
          <h6 className="fw-bold text-body mb-2">Grant creator</h6>
          <p className="text-muted small mb-3">The address must belong to a World ID-verified user.</p>
          <div className="d-flex gap-2">
            <input
              className="form-control rounded-4 bg-glass" placeholder="0x…"
              value={address} onChange={(e) => setAddress(e.target.value.trim())}
            />
            <button type="submit" className="btn btn-primary rounded-4 fw-bold px-4" disabled={busy || !secret}>
              Grant
            </button>
          </div>
        </form>

        {notice && <div className="alert alert-success rounded-4">{notice}</div>}
        {err && <div className="alert alert-danger rounded-4 text-break">{err}</div>}

        <div className="bg-glass rounded-4 overflow-hidden shadow-sm">
          <h6 className="fw-bold text-body p-3 mb-0 border-bottom">Current creators</h6>
          {creators === null ? (
            <p className="text-muted p-3 mb-0">{secret ? 'Not loaded.' : 'Enter the admin secret to load.'}</p>
          ) : creators.length === 0 ? (
            <p className="text-muted p-3 mb-0">No creators yet.</p>
          ) : (
            creators.map((c) => (
              <div key={c.address} className="p-3 border-bottom d-flex align-items-center">
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <p className="fw-bold text-body mb-0 d-flex align-items-center">
                    {c.name}{c.verified && <VerifiedBadge />}
                  </p>
                  <code className="small text-muted text-break">{c.address}</code>
                </div>
                <button
                  className="btn btn-outline-danger btn-sm rounded-pill px-3 ms-2 flex-shrink-0"
                  disabled={busy}
                  onClick={() => void setRole(c.address, false)}
                >
                  Revoke
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
