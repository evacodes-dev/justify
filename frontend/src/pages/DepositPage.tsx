import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { useBlinkDeposit } from '@swype-org/deposit/react'
import RightSidebar from '../components/layout/RightSidebar'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../components/common/Toast'

const MIN = 0.25 // Blink minimum
const BASE_SEPOLIA = 84532
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Circle USDC on Base Sepolia

// /deposit (TZ Part 3): two rails to get USDC onto Arc.
// - Flow: Dynamic's "any chain → USDC on Arc" funding.
// - Blink (sandbox): REAL Blink hosted deposit on Base Sepolia → bridge to Arc via CCTP.
export default function DepositPage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const { setShowDynamicUserProfile } = useDynamicContext()
  const toast = useToast()

  // Real Blink deposit widget (sandbox = public testnet env, no real funds).
  const { status, result, error, displayMessage, requestDeposit } = useBlinkDeposit({
    signer: '/api/sign-payment',
    environment: 'sandbox',
  })

  const a = 1
  const busy = status === 'signer-loading' || status === 'iframe-active'
  const done = status === 'completed' || !!result

  const blinkDeposit = () => {
    if (!isLoggedIn || !address) { promptLogin(); return }
    // Blink requestDeposit must be triggered from a click (browser blocks the iframe otherwise).
    requestDeposit({ amount: a, chainId: BASE_SEPOLIA, address, token: BASE_SEPOLIA_USDC })
  }

  const step = (label: string, active: boolean, ok: boolean) => (
    <div className="d-flex align-items-center mb-2">
      <span className={`material-icons me-2 ${ok ? 'text-success' : active ? 'text-primary' : 'text-muted'}`}>
        {ok ? 'check_circle' : active ? 'pending' : 'radio_button_unchecked'}
      </span>
      <span className={ok ? 'text-body' : 'text-muted'}>{label}</span>
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

          {/* Rail 2 — Blink (sandbox, Base Sepolia → Arc) */}
          <div className="bg-glass p-4 rounded-4 shadow-sm mb-3">
            <h6 className="fw-bold text-body mb-1">Blink — deposit on Base Sepolia <span className="badge bg-light-glass text-body fw-normal">sandbox</span></h6>
            <p className="text-muted small mb-3">Real Blink hosted flow on testnet (no real funds). Lands USDC on Base Sepolia, then bridge to Arc via CCTP.</p>

            <div className="bg-dark-glass rounded-4 p-3 mb-3">
              {step('Opened Blink', busy || done, done)}
              {step('Deposited on Base Sepolia', busy, done)}
              {step('Bridge to Arc (CCTP)', false, false)}
            </div>

            <button
              className="btn btn-primary rounded-5 w-100 py-3 fw-bold"
              disabled={busy}
              onClick={blinkDeposit}
            >
              {busy ? (displayMessage || 'Processing…') : 'Deposit via Blink (sandbox)'}
            </button>

            {error && <p className="text-danger small mt-2 mb-0">{displayMessage || 'Blink deposit failed.'}</p>}
            {done && (
              <p className="text-success small mt-2 mb-0">
                Deposited on Base Sepolia ✓ {result?.transfer?.id ? `· transfer ${String(result.transfer.id).slice(0, 10)}…` : ''}
              </p>
            )}
            {done && toast && null}
          </div>
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
