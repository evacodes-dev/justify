import { useCallback, useEffect, useState } from 'react'
import Modal from 'react-bootstrap/Modal'
import { IDKitRequestWidget, orbLegacy, type RpContext } from '@worldcoin/idkit'
import { useUi } from '../layout/UiContext'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import { submitProof, submitIdentityProof, getMe, getUser, updateProfile } from '../../lib/api'

const WORLD_APP_ID = import.meta.env.VITE_WORLD_APP_ID as `app_${string}`
const WORLD_RP_ID = import.meta.env.VITE_WORLD_RP_ID as string
const WORLD_ACTION = (import.meta.env.VITE_WORLD_ACTION as string) ?? 'create-market'
const WORLD_ACTION_IDENTITY = (import.meta.env.VITE_WORLD_ACTION_IDENTITY as string) ?? 'identity-check'
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS === 'true'

// Onboarding stepper: 1) Verify human (World ID 4.0 via IDKit — simulator on dev),
// 2) Identity check (second World ID verification — together they unlock Create Market),
// 3) Claim name, 4) Ready. A dev-bypass button is shown when VITE_DEV_BYPASS=true and the
// backend allows it (ALLOW_DEV_VERIFY).
export default function OnboardingModal() {
  const { activeModal, closeModal } = useUi()
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [checking, setChecking] = useState(false)
  const [name, setName] = useState('')
  const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [saving, setSaving] = useState(false)
  const [rpContext, setRpContext] = useState<RpContext | null>(null)
  const [widgetOpen, setWidgetOpen] = useState(false)
  // Which verification the open IDKit widget is performing.
  const [widgetFor, setWidgetFor] = useState<'human' | 'identity'>('human')

  const open = activeModal === 'onboard'

  // Both verification flags live on the user record — one fetch advances the stepper.
  const checkVerified = useCallback(async () => {
    if (!address) return
    setChecking(true)
    try {
      const b = await getMe(address)
      const u = b.user
      if (u?.identityVerified) setStep((s) => Math.max(s, 2))
      else if (u?.verified) setStep((s) => Math.max(s, 1))
    } catch {
      // stays on the current step
    } finally {
      setChecking(false)
    }
  }, [address])

  useEffect(() => {
    if (open) checkVerified()
  }, [open, checkVerified])

  // Real World ID 4.0: fetch the RP signature for the right action, then open IDKit.
  const startWorldId = async (kind: 'human' | 'identity') => {
    if (!isLoggedIn) { promptLogin(); return }
    try {
      const action = kind === 'human' ? WORLD_ACTION : WORLD_ACTION_IDENTITY
      const rp = await fetch('/api/rp-signature', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      }).then((r) => r.json())
      setRpContext({ rp_id: WORLD_RP_ID, nonce: rp.nonce, created_at: rp.created_at, expires_at: rp.expires_at, signature: rp.sig })
      setWidgetFor(kind)
      setWidgetOpen(true)
    } catch {
      toast.show('Could not start World ID. Is the backend running?', { kind: 'error' })
    }
  }

  // Dev bypass: mark the current step verified without a proof (backend gated by ALLOW_DEV_VERIFY).
  const devSkip = async (kind: 'human' | 'identity') => {
    if (!isLoggedIn) { promptLogin(); return }
    setChecking(true)
    try {
      if (kind === 'human') await submitProof({ walletAddress: address, idkitResponse: undefined as unknown })
      else await submitIdentityProof({ walletAddress: address, idkitResponse: undefined as unknown })
      await checkVerified()
      toast.show(`${kind === 'human' ? 'Human verification' : 'Identity check'} passed (dev bypass).`, { kind: 'info' })
    } catch (e) {
      toast.show((e as Error).message, { kind: 'error' })
    } finally { setChecking(false) }
  }

  // Debounced REAL availability check.
  useEffect(() => {
    const n = name.toLowerCase()
    if (!n) { setNameStatus('idle'); return }
    setNameStatus('checking')
    const t = setTimeout(() => {
      getUser(n)
        .then((b) => setNameStatus(b.user.address.toLowerCase() === address?.toLowerCase() ? 'available' : 'taken'))
        .catch(() => setNameStatus('available')) // 404 = free
    }, 400)
    return () => clearTimeout(t)
  }, [name, address])

  const saveName = async () => {
    if (!address || !name) return
    setSaving(true)
    try {
      await updateProfile({ address, name: name.toLowerCase() })
      setStep(3)
    } catch (e) {
      toast.show((e as Error).message || 'Could not save the name', { kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const stepDot = (i: number, label: string) => (
    <div className="d-flex flex-column align-items-center flex-grow-1">
      <span
        className={`rounded-circle d-flex align-items-center justify-content-center mb-1 ${i < step ? 'bg-success' : i === step ? 'bg-primary' : 'bg-secondary'}`}
        style={{ width: 28, height: 28, color: '#fff', fontSize: 14 }}
      >
        {i < step ? '✓' : i + 1}
      </span>
      <small className={i === step ? 'text-body' : 'text-muted'}>{label}</small>
    </div>
  )

  return (
    <Modal show={open} onHide={closeModal} centered contentClassName="rounded-4 shadow-sm p-4 border-0 bg-brown-gradient">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h5 className="text-body fw-bold mb-0">Get verified</h5>
        <a href="#" className="text-white text-decoration-none material-icons" onClick={(e) => { e.preventDefault(); closeModal() }}>close</a>
      </div>

      <div className="d-flex mb-4">
        {stepDot(0, 'Human')}
        {stepDot(1, 'Identity')}
        {stepDot(2, 'Name')}
        {stepDot(3, 'Ready')}
      </div>

      {step === 0 && (
        <div className="text-center">
          <div className="mb-2"><span className="material-icons text-primary" style={{ fontSize: 44 }}>verified_user</span></div>
          <p className="text-body fw-bold mb-1">Verify you're human</p>
          <p className="text-muted small mb-3">World ID 4.0 — one human, one voice. Uses the simulator on dev.</p>
          {!WORLD_APP_ID && <p className="text-warning small mb-2">VITE_WORLD_APP_ID not set.</p>}
          <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" onClick={() => startWorldId('human')} disabled={checking}>
            {checking ? 'Checking…' : 'Verify with World ID'}
          </button>
          {DEV_BYPASS && (
            <button className="btn btn-link text-muted small mt-2" onClick={() => devSkip('human')} disabled={checking}>
              Dev: skip verification
            </button>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="text-center">
          <div className="mb-2"><span className="material-icons text-primary" style={{ fontSize: 44 }}>badge</span></div>
          <p className="text-body fw-bold mb-1">Identity check</p>
          <p className="text-muted small mb-3">
            Second World ID verification. Together with the humanity check it unlocks creating
            markets — creators put their identity behind the questions they open.
          </p>
          <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" onClick={() => startWorldId('identity')} disabled={checking}>
            {checking ? 'Checking…' : 'Pass the identity check'}
          </button>
          {DEV_BYPASS && (
            <button className="btn btn-link text-muted small mt-2" onClick={() => devSkip('identity')} disabled={checking}>
              Dev: skip identity check
            </button>
          )}
          <button className="btn btn-link text-muted small mt-1" onClick={() => setStep(2)}>
            Skip for now — I only want to trade
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="text-body fw-bold mb-1">Claim your username</p>
          <p className="text-muted small mb-3">A unique username stored in the backend (no ENS).</p>
          <div className="form-floating bg-glass rounded-5 mb-3">
            <input
              className="form-control border-0 bg-transparent text-body rounded-5"
              id="claimName"
              placeholder="username"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            />
            <label htmlFor="claimName" className="text-muted">USERNAME</label>
          </div>
          <p className="small mb-3">
            {!name ? <span className="text-muted">Pick a handle</span>
              : nameStatus === 'checking' ? <span className="text-muted">Checking availability…</span>
              : nameStatus === 'taken' ? <span className="text-danger">“{name.toLowerCase()}” is taken</span>
              : nameStatus === 'available' ? <span className="text-success">“{name.toLowerCase()}” is available</span>
              : <span className="text-muted">&nbsp;</span>}
          </p>
          <button
            className="btn btn-primary rounded-5 w-100 py-3 fw-bold"
            disabled={!name || nameStatus === 'taken' || nameStatus === 'checking' || saving}
            onClick={saveName}
          >
            {saving ? 'Saving…' : 'Save name'}
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="text-center">
          <div className="mb-2"><span className="material-icons text-success" style={{ fontSize: 44 }}>check_circle</span></div>
          <p className="text-body fw-bold mb-1">You're verified</p>
          <p className="text-muted small mb-3">You now have the verified-human checkmark and can trade on Justify.</p>
          <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" onClick={closeModal}>Done</button>
        </div>
      )}

      {rpContext && (
        <IDKitRequestWidget
          open={widgetOpen}
          onOpenChange={setWidgetOpen}
          app_id={WORLD_APP_ID}
          action={widgetFor === 'human' ? WORLD_ACTION : WORLD_ACTION_IDENTITY}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          environment="staging"
          preset={orbLegacy({ signal: '' })}
          handleVerify={async (result) => {
            const res = widgetFor === 'human'
              ? await submitProof({ rp_id: WORLD_RP_ID, idkitResponse: result, walletAddress: address })
              : await submitIdentityProof({ rp_id: WORLD_RP_ID, idkitResponse: result, walletAddress: address })
            if (!res.success) throw new Error('Backend verification failed')
            await checkVerified()
          }}
          onSuccess={() => {
            setWidgetOpen(false)
            toast.show(widgetFor === 'human' ? 'World ID verified ✓' : 'Identity check passed ✓', { kind: 'success' })
          }}
        />
      )}
    </Modal>
  )
}