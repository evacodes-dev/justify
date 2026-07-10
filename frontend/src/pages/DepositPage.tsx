import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { useBlinkDeposit } from '@swype-org/deposit/react'
import RightSidebar from '../components/layout/RightSidebar'
import { useWallet } from '../hooks/useWallet'
import { CHAIN } from '../lib/markets'

// /deposit: two simple rails, no bridge — trading now lives natively on Base.
// 1) Dynamic funding (any chain / card into the embedded wallet)
// 2) Blink (sandbox): USDC straight to the USER's wallet on Base.
export default function DepositPage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const { setShowDynamicUserProfile } = useDynamicContext()

  const { status, result, error, displayMessage, requestDeposit } = useBlinkDeposit({
    signer: '/api/sign-payment',
    environment: 'sandbox',
  })

  const blinkBusy = status === 'signer-loading' || status === 'iframe-active'
  const blinkDone = status === 'completed' || !!result

  const startDeposit = () => {
    if (!isLoggedIn || !address) { promptLogin(); return }
    // Deposit lands directly on the user's wallet (not the backend).
    requestDeposit({ amount: 1, chainId: CHAIN.chainId, address, token: CHAIN.usdc })
  }

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="d-flex align-items-center mb-3">
            <span className="material-icons text-primary me-2">account_balance_wallet</span>
            <p className="mb-0 fw-bold text-body fs-6">Deposit USDC</p>
          </div>

          {/* Rail 1 — Dynamic Flow */}
          <div className="bg-glass p-4 rounded-4 shadow-sm mb-3">
            <h6 className="fw-bold text-body mb-1">Flow — any chain → USDC on Base</h6>
            <p className="text-muted small mb-3">Fund your embedded wallet from any chain or card via Dynamic.</p>
            <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" onClick={() => (isLoggedIn ? setShowDynamicUserProfile(true) : promptLogin())}>
              {isLoggedIn ? 'Open Dynamic funding' : 'Connect wallet'}
            </button>
          </div>

          {/* Rail 2 — Blink, native on Base */}
          <div className="bg-glass p-4 rounded-4 shadow-sm mb-3">
            <h6 className="fw-bold text-body mb-1">Blink <span className="badge bg-light-glass text-body fw-normal">sandbox</span></h6>
            <p className="text-muted small mb-3">Blink deposit on Base (no real funds in sandbox) — USDC goes straight to your wallet.</p>

            <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" disabled={blinkBusy} onClick={startDeposit}>
              {blinkBusy ? (displayMessage || 'Opening Blink…') : 'Deposit via Blink'}
            </button>

            {error && <p className="text-danger small mt-2 mb-0">{displayMessage || 'Failed.'}</p>}
            {blinkDone && <p className="text-success small mt-2 mb-0">USDC deposited to your wallet ✓</p>}
          </div>
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
