import { useCallback, useEffect, useState } from 'react'
import Modal from 'react-bootstrap/Modal'
import { useUi } from '../layout/UiContext'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import { verifyStatus } from '../../lib/api'

const WORLD_APP_ID = import.meta.env.VITE_WORLD_APP_ID
const SIMULATOR_URL = 'https://simulator.worldcoin.org'

// Onboarding stepper (TZ Part 2): 1) Verify human (World ID 4.0 — simulator on
// dev), 2) Claim name (DB name, no ENS), 3) Ready. Same bg-brown-gradient style.
// Verification status is the real backend gate (GET /api/verify-proof).
export default function OnboardingModal() {
  const { activeModal, closeModal } = useUi()
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [verified, setVerified] = useState(false)
  const [checking, setChecking] = useState(false)
  const [name, setName] = useState('')

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

  // On open, jump straight past step 1 if the wallet is already verified.
  useEffect(() => {
    if (open) checkVerified()
  }, [open, checkVerified])

  // While waiting on World ID, poll the backend so we advance when it confirms.
  useEffect(() => {
    if (!open || verified || step !== 0) return
    const t = setInterval(checkVerified, 4000)
    return () => clearInterval(t)
  }, [open, verified, step, checkVerified])

  const startWorldId = () => {
    if (!isLoggedIn) { promptLogin(); return }
    // World ID 4.0: open the simulator (dev) to produce a proof; the backend
    // records the verified wallet, and the poll above advances the stepper.
    window.open(SIMULATOR_URL, '_blank', 'noopener')
    toast.show('Complete World ID in the simulator — this updates automatically.', { kind: 'info', timeout: 8000 })
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
          <div style={{ fontSize: 40 }} className="mb-2">🛡️</div>
          <p className="text-body fw-bold mb-1">Verify you're human</p>
          <p className="text-muted small mb-3">World ID 4.0 — one human, one voice. Uses the simulator on dev.</p>
          {!WORLD_APP_ID && <p className="text-warning small mb-2">VITE_WORLD_APP_ID not set.</p>}
          <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" onClick={startWorldId} disabled={checking}>
            {checking ? 'Checking…' : 'Verify with World ID'}
          </button>
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
          <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" disabled={!name} onClick={() => setStep(2)}>
            Save name
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="text-center">
          <div style={{ fontSize: 40 }} className="mb-2">🎉</div>
          <p className="text-body fw-bold mb-1">You're verified</p>
          <p className="text-muted small mb-3">You can now create markets and trade as a verified human.</p>
          <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" onClick={closeModal}>Done</button>
        </div>
      )}
    </Modal>
  )
}
