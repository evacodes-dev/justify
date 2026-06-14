import { useEffect, useRef, useState } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { useBlinkDeposit } from '@swype-org/deposit/react'
import RightSidebar from '../components/layout/RightSidebar'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../components/common/Toast'

const BASE_SEPOLIA = 84532
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const ARC_EXPLORER = 'https://testnet.arcscan.app'

type BridgeStatus = '' | 'queued' | 'awaiting_funds' | 'bridging_burn' | 'bridging_attest' | 'bridging_mint' | 'done' | 'error'

// /deposit: Blink (sandbox) deposits USDC to OUR backend on Base Sepolia, then the
// backend AUTO-bridges Base Sepolia → Arc via Circle CCTP to the user. One click.
export default function DepositPage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const { setShowDynamicUserProfile } = useDynamicContext()
  const toast = useToast()

  const [backend, setBackend] = useState<string>('')
  const [bridge, setBridge] = useState<BridgeStatus>('')
  const [arcTx, setArcTx] = useState('')
  const [bridgeErr, setBridgeErr] = useState('')
  const [bridgeAmount, setBridgeAmount] = useState('')
  const started = useRef(false)

  const { status, result, error, displayMessage, requestDeposit } = useBlinkDeposit({
    signer: '/api/sign-payment',
    environment: 'sandbox',
  })

  useEffect(() => {
    fetch('/api/deposit/bridge-info').then((r) => r.json()).then((b) => setBackend(b.backend)).catch(() => {})
  }, [])

  const blinkBusy = status === 'signer-loading' || status === 'iframe-active'
  const blinkDone = status === 'completed' || !!result

  // when Blink finishes, kick off the Base→Arc auto-bridge
  useEffect(() => {
    if (!blinkDone || started.current || !address) return
    started.current = true
    setBridge('queued')
    fetch('/api/deposit/from-base', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipient: address }),
    })
      .then((r) => r.json())
      .then((b) => {
        if (b.error || !b.id) { setBridge('error'); setBridgeErr(b.error || 'bridge start failed'); return }
        const poll = setInterval(async () => {
          const j = await fetch(`/api/deposit/status/${b.id}`).then((r) => r.json()).catch(() => null)
          if (!j) return
          setBridge(j.status); setBridgeAmount(j.amountUsdc || ''); setArcTx(j.txs?.mintArc || '')
          if (j.status === 'done') { clearInterval(poll); toast.show('Bridged to Arc ✓', { kind: 'success' }) }
          if (j.status === 'error') { clearInterval(poll); setBridgeErr(j.error || 'bridge error') }
        }, 5000)
      })
      .catch(() => { setBridge('error'); setBridgeErr('bridge start failed') })
  }, [blinkDone, address, toast])

  const startDeposit = () => {
    if (!isLoggedIn || !address) { promptLogin(); return }
    if (!backend) { toast.show('Backend not reachable.', { kind: 'error' }); return }
    started.current = false; setBridge(''); setArcTx(''); setBridgeErr('')
    // Blink deposits to OUR backend on Base Sepolia → backend auto-bridges to Arc.
    requestDeposit({ amount: 1, chainId: BASE_SEPOLIA, address: backend, token: BASE_SEPOLIA_USDC })
  }

  const bridging = ['queued', 'awaiting_funds', 'bridging_burn', 'bridging_attest', 'bridging_mint'].includes(bridge)
  const bridgeLabel: Record<string, string> = {
    queued: 'Starting…', awaiting_funds: 'Waiting for funds on Base…', bridging_burn: 'Burning on Base (CCTP)…',
    bridging_attest: 'Circle attestation…', bridging_mint: 'Minting on Arc…', done: 'Done', error: 'Failed',
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
            <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" onClick={() => (isLoggedIn ? setShowDynamicUserProfile(true) : promptLogin())}>
              {isLoggedIn ? 'Open Dynamic funding' : 'Connect wallet'}
            </button>
          </div>

          {/* Rail 2 — Blink (sandbox) → CCTP bridge to Arc */}
          <div className="bg-glass p-4 rounded-4 shadow-sm mb-3">
            <h6 className="fw-bold text-body mb-1">Blink → Arc <span className="badge bg-light-glass text-body fw-normal">sandbox</span></h6>
            <p className="text-muted small mb-3">Real Blink deposit on Base Sepolia (no real funds), then auto-bridged to Arc via Circle CCTP.</p>

            <div className="bg-dark-glass rounded-4 p-3 mb-3">
              {step('Deposit on Base Sepolia (Blink)', blinkBusy, blinkDone)}
              {step(`Bridge to Arc (CCTP)${bridgeAmount ? ` · $${bridgeAmount}` : ''}`, bridging, bridge === 'done')}
            </div>

            <button className="btn btn-primary rounded-5 w-100 py-3 fw-bold" disabled={blinkBusy || bridging} onClick={startDeposit}>
              {blinkBusy ? (displayMessage || 'Opening Blink…') : bridging ? (bridgeLabel[bridge] || 'Bridging…') : 'Deposit via Blink → Arc'}
            </button>

            {(error || bridgeErr) && <p className="text-danger small mt-2 mb-0">{bridgeErr || displayMessage || 'Failed.'}</p>}
            {bridge === 'done' && (
              <p className="text-success small mt-2 mb-0">
                ✅ USDC bridged to Arc{arcTx ? <> · <a href={`${ARC_EXPLORER}/tx/${arcTx}`} target="_blank" rel="noreferrer" className="fw-bold">view tx ↗</a></> : ''}
              </p>
            )}
          </div>
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
