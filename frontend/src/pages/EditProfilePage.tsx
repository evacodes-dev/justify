import { useEffect, useRef, useState } from 'react'
import RightSidebar from '../components/layout/RightSidebar'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../components/common/Toast'
import { getMe, updateProfile, uploadImage } from '../lib/api'
import { fileToResizedDataUrl } from '../lib/upload'

// Settings — real profile backed by the backend (name + bio). No ENS; the name is
// a backend display handle. Open to any signed-in wallet — World ID is only the
// verified checkmark, not a prerequisite for having a profile.
export default function EditProfilePage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState('')
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!address) { setLoading(false); return }
    getMe(address)
      .then((b) => { if (b.user) { setName(b.user.name); setDisplayName(b.user.displayName ?? ''); setBio(b.user.bio ?? ''); setAvatar(b.user.avatar ?? ''); setVerified(b.user.verified) } })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address])

  const pickAvatar = async (file?: File) => {
    if (!file || !address) return
    setUploading(true)
    try {
      const dataUrl = await fileToResizedDataUrl(file, 400)
      const { url } = await uploadImage(address, dataUrl)
      setAvatar(url)
    } catch (e) {
      toast.show((e as Error).message || 'Upload failed', { kind: 'error' })
    } finally { setUploading(false) }
  }

  const save = async () => {
    if (!isLoggedIn || !address) { promptLogin(); return }
    setSaving(true)
    try {
      await updateProfile({ address, name: name.toLowerCase().replace(/[^a-z0-9_]/g, ''), displayName, bio, avatar })
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
              <div className="d-flex align-items-center gap-3 mb-4">
                <img
                  src={avatar || '/img/images.jpeg'}
                  alt="avatar"
                  className="rounded-circle"
                  style={{ width: 72, height: 72, objectFit: 'cover', border: '2px solid rgba(255,255,255,.1)' }}
                />
                <div>
                  <input ref={fileRef} type="file" accept="image/*" className="d-none"
                    onChange={(e) => pickAvatar(e.target.files?.[0])} />
                  <button type="button" className="btn btn-outline-secondary btn-sm rounded-4"
                    disabled={uploading} onClick={() => fileRef.current?.click()}>
                    {uploading ? 'Uploading…' : 'Change photo'}
                  </button>
                  <div className="text-muted small mt-1">JPG/PNG, auto-resized</div>
                </div>
              </div>
              <div className="form-floating mb-3">
                <input className="form-control rounded-4 bg-glass" id="pn" value={name}
                  onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="username" />
                <label htmlFor="pn" className="text-muted">USERNAME</label>
              </div>
              <div className="form-floating mb-3">
                <input className="form-control rounded-4 bg-glass" id="pdn" value={displayName} maxLength={40}
                  onChange={(e) => setDisplayName(e.target.value)} placeholder="display name" />
                <label htmlFor="pdn" className="text-muted">DISPLAY NAME</label>
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
