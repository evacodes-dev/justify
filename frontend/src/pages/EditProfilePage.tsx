import { useEffect, useState } from 'react'
import RightSidebar from '../components/layout/RightSidebar'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../components/common/Toast'
import { getMe, updateProfile } from '../lib/api'
import { COUNTRIES } from '../lib/countries'

// Settings — real profile backed by the backend (name + bio). No ENS; the name is
// a backend display handle. Requires a verified user (created at onboarding).
export default function EditProfilePage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!address) { setLoading(false); return }
    getMe(address)
      .then((b) => { if (b.user) { setName(b.user.name); setBio(b.user.bio ?? ''); setCountry(b.user.country ?? ''); setVerified(b.user.verified) } })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address])

  const save = async () => {
    if (!isLoggedIn || !address) { promptLogin(); return }
    setSaving(true)
    try {
      await updateProfile({ address, name: name.toLowerCase().replace(/[^a-z0-9_]/g, ''), bio, country })
      toast.show('Profile saved', { kind: 'success' })
    } catch (e) {
      toast.show((e as Error).message, { kind: 'error' })
    } finally { setSaving(false) }
  }

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="d-flex align-items-center mb-4">
            <span className="material-icons text-primary me-2">settings</span>
            <h4 className="mb-0 fw-bold text-body">Settings</h4>
          </div>

          {!isLoggedIn ? (
            <div className="bg-glass p-4 rounded-4 text-center">
              <p className="text-muted mb-3">Connect your wallet to edit your profile.</p>
              <button className="btn btn-primary rounded-5 px-4 py-2 fw-bold" onClick={promptLogin}>Connect wallet</button>
            </div>
          ) : loading ? (
            <div className="text-center py-5"><div className="spinner-border" role="status" /></div>
          ) : (
            <div className="bg-glass p-4 rounded-4 shadow-sm">
              {!verified && <p className="text-warning small mb-3">Verify with World ID first to claim a name.</p>}
              <div className="form-floating mb-3">
                <input className="form-control rounded-4 bg-glass" id="pn" value={name}
                  onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="name" />
                <label htmlFor="pn" className="text-muted">NAME</label>
              </div>
              <div className="form-floating mb-3">
                <textarea className="form-control rounded-4 bg-glass" id="pb" style={{ height: 100 }}
                  value={bio} onChange={(e) => setBio(e.target.value)} placeholder="bio" />
                <label htmlFor="pb" className="text-muted">BIO</label>
              </div>
              <div className="form-floating mb-3">
                <select className="form-select rounded-4 bg-glass" id="pc" value={country} onChange={(e) => setCountry(e.target.value)}>
                  <option value="">— not set —</option>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
                <label htmlFor="pc" className="text-muted">COUNTRY (for country-restricted markets)</label>
              </div>
              <p className="text-muted small mb-3">Your country is tied to your World ID (one per human). Used to gate country-restricted markets.</p>
              <div className="mb-3">
                <label className="text-muted small d-block mb-1">WALLET (Arc)</label>
                <code className="text-body small">{address}</code>
              </div>
              <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold text-uppercase" disabled={saving || !verified} onClick={save}>
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          )}
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
