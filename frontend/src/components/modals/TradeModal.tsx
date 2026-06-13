import { useEffect, useState } from 'react'
import Modal from 'react-bootstrap/Modal'
import { useUi } from '../layout/UiContext'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import { approveAndBet, txUrl } from '../../lib/arc'

// Trade modal (TZ Part 1 — "Buy YES/NO → trade modal"): USDC amount → client-side
// shares/payout preview → approve USDC + buy on Arc → tx success. Same
// bg-brown-gradient / bg-glass styling as PostModal.
export default function TradeModal() {
  const { activeModal, closeModal, tradeTarget } = useUi()
  const { isLoggedIn, promptLogin, getArcWalletClient } = useWallet()
  const toast = useToast()

  const [side, setSide] = useState<0 | 1>(1)
  const [amount, setAmount] = useState('0.5')
  const [phase, setPhase] = useState<'idle' | 'signing'>('idle')

  // Sync the side selector with whatever Buy button opened the modal.
  useEffect(() => {
    if (tradeTarget) {
      setSide(tradeTarget.side)
      setAmount('0.5')
      setPhase('idle')
    }
  }, [tradeTarget])

  if (!tradeTarget) return null

  const yesPct = tradeTarget.yesPct
  const a = parseFloat(amount)
  // DemoMarket is a binary 1:1 stake pool (matches the contract — no AMM curve):
  // shares = amount; price = pool-implied probability; payout if correct = stake/price.
  const price = side === 1 ? yesPct / 100 : (100 - yesPct) / 100
  const shares = a > 0 ? a : 0
  const payout = price > 0 && a > 0 ? a / price : 0
  const priceImpact = 0 // flat 1:1 pool — no slippage in the demo contract

  const confirm = async () => {
    if (!isLoggedIn) {
      promptLogin()
      return
    }
    if (!(a > 0)) return
    setPhase('signing')
    try {
      const wc = await getArcWalletClient()
      const { betHash } = await approveAndBet(wc, tradeTarget.address, side, a)
      toast.show(`Bet placed: ${side === 1 ? 'YES' : 'NO'} · ${a} USDC`, {
        kind: 'success',
        href: txUrl(betHash),
        hrefLabel: 'View tx on Arcscan ↗',
      })
      closeModal()
    } catch (e: any) {
      toast.show(e?.shortMessage || e?.message || 'Transaction failed', { kind: 'error' })
    } finally {
      setPhase('idle')
    }
  }

  return (
    <Modal
      show={activeModal === 'trade'}
      onHide={phase === 'signing' ? undefined : closeModal}
      centered
      contentClassName="rounded-4 shadow-sm p-4 border-0 bg-brown-gradient"
    >
      <div className="modal-header d-flex align-items-center justify-content-between border-0 p-0 mb-3">
        <h5 className="modal-title text-body fw-bold mb-0">Place a bet</h5>
        <a
          href="#"
          className="text-white text-decoration-none material-icons"
          onClick={(e) => { e.preventDefault(); if (phase !== 'signing') closeModal() }}
        >
          close
        </a>
      </div>

      <p className="text-body fw-bold mb-3">{tradeTarget.question}</p>

      <div className="d-flex gap-2 mb-3">
        <button
          type="button"
          className={`btn flex-grow-1 rounded-4 fw-bold ${side === 1 ? 'btn-success' : 'btn-outline-secondary text-body'}`}
          onClick={() => setSide(1)}
        >
          YES · {yesPct}¢
        </button>
        <button
          type="button"
          className={`btn flex-grow-1 rounded-4 fw-bold ${side === 0 ? 'btn-danger' : 'btn-outline-secondary text-body'}`}
          onClick={() => setSide(0)}
        >
          NO · {100 - yesPct}¢
        </button>
      </div>

      <div className="form-floating rounded-5 bg-glass mb-3">
        <input
          type="number"
          className="form-control border-0 shadow-sm bg-transparent text-body"
          id="tradeAmount"
          placeholder="0.5"
          value={amount}
          min={0}
          step="0.1"
          inputMode="decimal"
          disabled={phase === 'signing'}
          onChange={(e) => setAmount(e.target.value)}
        />
        <label htmlFor="tradeAmount" className="text-muted">Amount (USDC)</label>
      </div>

      <div className="bg-glass rounded-4 p-3 mb-3 small">
        <div className="d-flex justify-content-between mb-1">
          <span className="text-muted">Est. shares</span>
          <span className="text-body">{shares > 0 ? shares.toFixed(2) : '—'}</span>
        </div>
        <div className="d-flex justify-content-between mb-1">
          <span className="text-muted">Avg price</span>
          <span className="text-body">{price > 0 ? `${Math.round(price * 100)}¢` : '—'}</span>
        </div>
        <div className="d-flex justify-content-between mb-1">
          <span className="text-muted">Price impact</span>
          <span className="text-body">{priceImpact}%</span>
        </div>
        <div className="d-flex justify-content-between">
          <span className="text-muted">To win (if correct)</span>
          <span className="text-success fw-bold">${payout > 0 ? payout.toFixed(2) : '0.00'}</span>
        </div>
      </div>

      <button
        className="btn btn-primary rounded-5 w-100 py-3 fw-bold text-uppercase"
        disabled={phase === 'signing' || !(a > 0)}
        onClick={confirm}
      >
        {phase === 'signing'
          ? 'Signing approve + buy…'
          : isLoggedIn
            ? `Approve + Buy ${side === 1 ? 'YES' : 'NO'} · real tx on Arc`
            : 'Connect wallet to bet'}
      </button>
    </Modal>
  )
}
