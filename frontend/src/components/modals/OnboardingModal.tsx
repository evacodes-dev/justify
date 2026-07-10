import { useCallback, useEffect, useState } from 'react'
import Modal from 'react-bootstrap/Modal'
import { IDKitRequestWidget, orbLegacy, type RpContext } from '@worldcoin/idkit'
import { useUi } from '../layout/UiContext'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import { verifyStatus, submitProof } from '../../lib/api'

const WORLD_APP_ID = import.meta.env.VITE_WORLD_APP_ID as `app_${string}`
const WORLD_RP_ID = import.meta.env.VITE_WORLD_RP_ID as string
const WORLD_ACTION = (import.meta.env.VITE_WORLD_ACTION as string) ?? 'create-market'
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS === 'true'

// Onboarding stepper (TZ Part 2): 1) Verify human (real World ID 4.0 via IDKit —
// simulator on dev), 2) Claim name (DB name, no ENS), 3) Ready. A dev-bypass button
// is shown when VITE_DEV_BYPASS=true and the backend allows it (ALLOW_DEV_VERIFY).
export default function OnboardingModal() {
  const { activeModal, closeModal } = useUi()
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [verified, setVerified] = useState(false)
  const [checking, setChecking] = useState(false)
  const [name, setName] = useState('')
  const [rpContext, setRpContext] = useState<RpContext | null>(null)
  const [widgetOpen, setWidgetOpen] = useState(false)

  const open = activeModal === 'onboard'

  const checkVerified = useCallback(async () => {
    if (!address) return false
    setChecking(true)
    const v = await verifyStatus(address)
    setChecking(false)
    setVerified(v)
    if (v) setStep((s) => (s === 0 ? 1 : s))
    return v
  }, [address])

  useEffect(() => {
    if (open) checkVerified()
  }, [open, checkVerified])

  // Real World ID 4.0: fetch the RP signature, then open the IDKit widget.
  const startWorldId = async () => {
    if (!isLoggedIn) { promptLogin(); return }
    try {
      const rp = await fetch('/api/rp-signature', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: WORLD_ACTION }),
      }).then((r) => r.json())
      setRpContext({ rp_id: WORLD_RP_ID, nonce: rp.nonce, created_at: rp.created_at, expires_at: rp.expires_at, signature: rp.sig })
      setWidgetOpen(true)
    } catch {
      toast.show('Could not start World ID. Is the backend running?', { kind: 'error' })
    }
  }

  // Dev bypass: mark verified without a proof (backend gated by ALLOW_DEV_VERIFY).
  const devSkip = async () => {
    if (!isLoggedIn) { promptLogin(); return }
    setChecking(true)
    try {
      await submitProof({ walletAddress: address, idkitResponse: undefined as unknown })
      await checkVerified()
      toast.show('Verified (dev bypass).', { kind: 'info' })
    } catch (e) {
      toast.show((e as Error).message, { kind: 'error' })
    } finally { setChecking(false) }
  }

  const saveName = async () => {
    try {
      await fetch('/api/verify-proof', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ walletAddress: address, name }),
      })
    } catch { /* name is best-effort */ }
    setStep(2)
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
        {stepDot(0, 'Verify')}
        {stepDot(1, 'Name')}
        {stepDot(2, 'Ready')}
      </div>

      {step === 0 && (
        <div className="text-center">
          <div className="mb-2"><span className="material-icons text-primary" style={{ fontSize: 44 }}>verified_user</span></div>
          <p className="text-body fw-bold mb-1">Verify you're human</p>
          <p className="text-muted small mb-3">World ID 4.0 — one human, one voice. Uses the simulator on dev.</p>
          {!WORLD_APP_ID && <p className="text-warning small mb-2">VITE_WORLD_APP_ID not set.</p>}
          <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" onClick={startWorldId} disabled={checking}>
            {checking ? 'Checking…' : 'Verify with World ID'}
          </button>
          {DEV_BYPASS && (
            <button className="btn btn-link text-muted small mt-2" onClick={devSkip} disabled={checking}>
              Dev: skip verification
            </button>
          )}
        </div>
      )}

      {step === 1 && (
        <div>
          <p className="text-body fw-bold mb-1">Claim your name</p>
          <p className="text-muted small mb-3">A display name stored in the backend (no ENS).</p>
          <div className="form-floating bg-glass rounded-5 mb-3">
            <input
              className="form-control border-0 bg-transparent text-body rounded-5"
              id="claimName"
              placeholder="name"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            />
            <label htmlFor="claimName" className="text-muted">YOUR NAME</label>
          </div>
          <p className="small mb-3">
            {name ? <span className="text-success">“{name}” looks available ✓</span> : <span className="text-muted">Pick a handle</span>}
          </p>
          <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" disabled={!name} onClick={saveName}>
            Save name
          </button>
        </div>
      )}

      {step === 2 && (
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
          action={WORLD_ACTION}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          environment="staging"
          preset={orbLegacy({ signal: '' })}
          handleVerify={async (result) => {
            const res = await submitProof({ rp_id: WORLD_RP_ID, idkitResponse: result, walletAddress: address })
            if (!res.success) throw new Error('Backend verification failed')
            await checkVerified()
          }}
          onSuccess={() => { setWidgetOpen(false); toast.show('World ID verified ✓', { kind: 'success' }) }}
        />
      )}
    </Modal>
  )
}
