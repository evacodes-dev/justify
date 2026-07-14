import { useEffect, useState } from 'react'
import RightSidebar from '../components/layout/RightSidebar'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../components/common/Toast'
import { getMe, updateProfile } from '../lib/api'

// Settings — real profile backed by the backend (name + bio). No ENS; the name is
// a backend display handle. Open to any signed-in wallet — World ID is only the
// verified checkmark, not a prerequisite for having a profile.
export default function EditProfilePage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!address) { setLoading(false); return }
    getMe(address)
      .then((b) => { if (b.user) { setName(b.user.name); setBio(b.user.bio ?? ''); setVerified(b.user.verified) } })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address])

  const save = async () => {
    if (!isLoggedIn || !address) { promptLogin(); return }
    setSaving(true)
    try {
      await updateProfile({ address, name: name.toLowerCase().replace(/[^a-z0-9_]/g, ''), bio })
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
              {!verified && (
                <p className="text-muted small mb-3">
                  Set your name and bio freely. Verifying with World ID adds the blue checkmark and unlocks market creation — it isn't required to have a profile.
                </p>
              )}
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
              <div className="mb-3">
                <label className="text-muted small d-block mb-1">WALLET</label>
                <code className="text-body small">{address}</code>
              </div>
              <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold text-uppercase" disabled={saving || !name} onClick={save}>
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
