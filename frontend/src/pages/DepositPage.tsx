import { useState } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import RightSidebar from '../components/layout/RightSidebar'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../components/common/Toast'

const MIN = 0.25 // Blink minimum (TZ: do not allow less)
type Stage = 'idle' | 'depositing' | 'deposited' | 'bridging' | 'done' | 'error'

// /deposit (TZ Part 3): two rails to get USDC onto Arc.
// - Flow: Dynamic's "any chain → USDC on Arc" funding.
// - Blink: deposit on Base → bridge to Arc (staged statuses, min $0.25).
export default function DepositPage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const { setShowDynamicUserProfile } = useDynamicContext()
  const toast = useToast()
  const [amount, setAmount] = useState('1')
  const [stage, setStage] = useState<Stage>('idle')
  const a = parseFloat(amount)

  const blinkDeposit = async () => {
    if (!isLoggedIn) { promptLogin(); return }
    if (!(a >= MIN)) { toast.show(`Minimum deposit is $${MIN}`, { kind: 'error' }); return }
    // Blink requestDeposit must be triggered from a click (browser blocks iframe
    // otherwise). Real flow: /api/sign-payment → requestDeposit → /api/bridge.
    try {
      setStage('depositing')
      const res = await fetch('/api/sign-payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: a, chainId: 8453, address, token: 'USDC' }),
      })
      if (!res.ok) throw new Error('Blink signer unavailable (needs backend + merchantId)')
      setStage('deposited')
      // Stage 2 — bridge Base → Arc.
      setStage('bridging')
      await new Promise((r) => setTimeout(r, 800))
      setStage('done')
      toast.show('Deposit bridged to Arc ✓', { kind: 'success' })
    } catch (e: any) {
      setStage('error')
      toast.show(e?.message || 'Blink deposit needs the backend (merchantId).', { kind: 'error' })
    }
  }

  const step = (label: string, active: boolean, done: boolean) => (
    <div className="d-flex align-items-center mb-2">
      <span className={`material-icons me-2 ${done ? 'text-success' : active ? 'text-primary' : 'text-muted'}`}>
        {done ? 'check_circle' : active ? 'pending' : 'radio_button_unchecked'}
      </span>
      <span className={done ? 'text-body' : 'text-muted'}>{label}</span>
    </div>
  )

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="d-flex align-items-center mb-3">
            <span className="material-icons text-primary me-2">account_balance_wallet</span>
            <p className="mb-0 fw-bold text-body fs-6">Deposit USDC to Arc</p>
          </div>

          {/* Rail 1 — Dynamic Flow */}
          <div className="bg-glass p-4 rounded-4 shadow-sm mb-3">
            <h6 className="fw-bold text-body mb-1">Flow — any chain → USDC on Arc</h6>
            <p className="text-muted small mb-3">Fund your embedded wallet from any chain or card via Dynamic.</p>
            <button
              className="btn btn-primary rounded-5 w-100 py-3 fw-bold"
              onClick={() => (isLoggedIn ? setShowDynamicUserProfile(true) : promptLogin())}
            >
              {isLoggedIn ? 'Open Dynamic funding' : 'Connect wallet'}
            </button>
          </div>

          {/* Rail 2 — Blink (Base → Arc) */}
          <div className="bg-glass p-4 rounded-4 shadow-sm mb-3">
            <h6 className="fw-bold text-body mb-1">Blink — deposit on Base, bridge to Arc</h6>
            <p className="text-muted small mb-3">Minimum ${MIN}. Funds land on Base, then bridge to Arc via CCTP.</p>

            <div className="form-floating bg-glass rounded-5 mb-3">
              <input
                type="number"
                className="form-control border-0 bg-transparent text-body rounded-5"
                id="depAmount"
                placeholder="1"
                min={MIN}
                step="0.25"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <label htmlFor="depAmount" className="text-muted">Amount (USDC)</label>
            </div>

            <div className="bg-dark-glass rounded-4 p-3 mb-3">
              {step('Deposited on Base', stage === 'depositing', ['deposited', 'bridging', 'done'].includes(stage))}
              {step('Bridged to Arc', stage === 'bridging', stage === 'done')}
            </div>

            <button
              className="btn btn-primary rounded-5 w-100 py-3 fw-bold"
              disabled={stage === 'depositing' || stage === 'bridging'}
              onClick={blinkDeposit}
            >
              {stage === 'depositing' || stage === 'bridging' ? 'Processing…' : `Deposit ${a >= MIN ? `$${a}` : ''} via Blink`}
            </button>
          </div>
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
