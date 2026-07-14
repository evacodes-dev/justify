import { useEffect, useState } from 'react'
import Modal from 'react-bootstrap/Modal'
import { Link } from 'react-router-dom'
import { useUi } from '../layout/UiContext'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import { buyShares, sellShares, quoteBuy, quoteSell, usdcBalance, txUrl } from '../../lib/arc'
import { CHAIN } from '../../lib/markets'

// Trade modal over the Gnosis FPMM. Buy: USDC in → outcome shares (2% slippage
// guard via calcBuyAmount). Sell: USDC out ← shares burned (calcSellAmount).
export default function TradeModal() {
  const { activeModal, closeModal, tradeTarget } = useUi()
  const { address, isLoggedIn, promptLogin, getChainWalletClient } = useWallet()
  const toast = useToast()

  const [side, setSide] = useState<0 | 1>(1)
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('0.5')
  const [phase, setPhase] = useState<'idle' | 'signing'>('idle')
  const [quote, setQuote] = useState<number | null>(null) // buy: shares out; sell: shares to burn
  const [balance, setBalance] = useState<number | null>(null)

  // Sync with whatever button opened the modal.
  useEffect(() => {
    if (tradeTarget) {
      setSide(tradeTarget.side)
      setMode(tradeTarget.mode)
      // confirmation UX: carry over what the user already typed in the trade box
      setAmount(tradeTarget.amount && tradeTarget.amount > 0 ? String(tradeTarget.amount) : '0.5')
      setPhase('idle')
    }
  }, [tradeTarget])

  const fpmm = tradeTarget?.market.address
  const a = parseFloat(amount)

  // wallet USDC balance — block buys that would only revert on-chain
  useEffect(() => {
    setBalance(null)
    if (!tradeTarget || !address) return
    usdcBalance(address).then(setBalance).catch(() => {})
  }, [tradeTarget, address])
  const insufficient = mode === 'buy' && balance != null && a > balance
  // per-market bet cap (beta): platform limits single-buy size
  const maxBet = CHAIN.maxBetUsdc ?? 0
  const overCap = mode === 'buy' && maxBet > 0 && a > maxBet

  // Live on-chain quote (debounced) — the source of truth for the preview.
  useEffect(() => {
    setQuote(null)
    if (!fpmm || !(a > 0)) return
    const t = setTimeout(() => {
      const q = mode === 'buy' ? quoteBuy(fpmm, side, a) : quoteSell(fpmm, side, a)
      q.then(setQuote).catch(() => setQuote(null))
    }, 300)
    return () => clearTimeout(t)
  }, [fpmm, side, mode, a])

  if (!tradeTarget) return null

  const yesPct = tradeTarget.yesPct
  const price = side === 1 ? yesPct / 100 : (100 - yesPct) / 100
  // Fallback preview from the spot price until the on-chain quote lands.
  const estShares = quote ?? (price > 0 && a > 0 ? a / price : 0)
  const avgPrice = estShares > 0 && a > 0 ? a / estShares : price

  const confirm = async () => {
    if (!isLoggedIn) {
      promptLogin()
      return
    }
    if (!(a > 0)) return
    setPhase('signing')
    try {
      const wc = await getChainWalletClient()
      if (mode === 'buy') {
        const { betHash } = await buyShares(wc, tradeTarget.market.address, side, a)
        toast.show(`Bought ${side === 1 ? 'YES' : 'NO'} for ${a} USDC`, {
          kind: 'success',
          href: txUrl(betHash),
          hrefLabel: 'View tx ↗',
        })
      } else {
        const { sellHash } = await sellShares(wc, tradeTarget.market.address, side, a)
        toast.show(`Sold ${side === 1 ? 'YES' : 'NO'} for ${a} USDC`, {
          kind: 'success',
          href: txUrl(sellHash),
          hrefLabel: 'View tx ↗',
        })
      }
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
        <h5 className="modal-title text-body fw-bold mb-0">{mode === 'buy' ? 'Place a bet' : 'Sell position'}</h5>
        <a
          href="#"
          className="text-white text-decoration-none material-icons"
          onClick={(e) => { e.preventDefault(); if (phase !== 'signing') closeModal() }}
        >
          close
        </a>
      </div>

      <p className="text-body fw-bold mb-3">{tradeTarget.market.question}</p>

      <div className="d-flex gap-2 mb-3">
        <button
          type="button"
          className={`btn flex-grow-1 rounded-4 fw-bold ${side === 1 ? 'btn-success' : 'btn-outline-secondary text-body'}`}
          onClick={() => setSide(1)}
        >
          YES · ${(yesPct / 100).toFixed(2)}
        </button>
        <button
          type="button"
          className={`btn flex-grow-1 rounded-4 fw-bold ${side === 0 ? 'btn-danger' : 'btn-outline-secondary text-body'}`}
          onClick={() => setSide(0)}
        >
          NO · ${((100 - yesPct) / 100).toFixed(2)}
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
        <label htmlFor="tradeAmount" className="text-muted">
          {mode === 'buy' ? 'Amount to spend (USDC)' : 'Amount to receive (USDC)'}
        </label>
      </div>

      {mode === 'buy' && maxBet > 0 && (
        <div className={`small mb-2 ${overCap ? 'text-danger' : 'text-muted'}`}>
          Max bet ${maxBet.toFixed(0)} per trade{overCap ? ' — lower the amount' : ''}
        </div>
      )}

      {isLoggedIn && balance != null && (
        <div className={`small mb-3 d-flex justify-content-between ${insufficient ? 'text-danger' : 'text-muted'}`}>
          <span>Wallet balance: ${balance.toFixed(2)} USDC</span>
          {insufficient && <Link to="/deposit" className="text-primary text-decoration-none" onClick={closeModal}>Deposit USDC</Link>}
        </div>
      )}

      <div className="bg-glass rounded-4 p-3 mb-3 small">
        <div className="d-flex justify-content-between mb-1">
          <span className="text-muted">{mode === 'buy' ? 'Est. shares' : 'Shares to sell (max)'}</span>
          <span className="text-body">{estShares > 0 ? estShares.toFixed(2) : '—'}</span>
        </div>
        <div className="d-flex justify-content-between mb-1">
          <span className="text-muted">Avg price</span>
          <span className="text-body">{avgPrice > 0 ? `$${avgPrice.toFixed(2)}` : '—'}</span>
        </div>
        {mode === 'buy' ? (
          <>
            <div className="d-flex justify-content-between mb-1">
              <span className="text-muted">Slippage tolerance</span>
              <span className="text-body">2%</span>
            </div>
            <div className="d-flex justify-content-between">
              <span className="text-muted">To win (if correct)</span>
              <span className="text-success fw-bold">${estShares > 0 ? estShares.toFixed(2) : '0.00'}</span>
            </div>
            <div className="text-muted mt-2 pt-2 border-top border-secondary border-opacity-25" style={{ fontSize: 12 }}>
              The price is the market's probability: ${(yesPct / 100).toFixed(2)} ≈ {yesPct}% chance.
              Every share pays $1 if you're right.
            </div>
          </>
        ) : (
          <div className="d-flex justify-content-between">
            <span className="text-muted">You receive</span>
            <span className="text-success fw-bold">${a > 0 ? a.toFixed(2) : '0.00'}</span>
          </div>
        )}
      </div>

      <button
        className="btn btn-primary rounded-5 w-100 py-3 fw-bold text-uppercase"
        disabled={phase === 'signing' || !(a > 0) || insufficient || overCap}
        onClick={confirm}
      >
        {phase === 'signing'
          ? (mode === 'buy' ? 'Signing approve + buy…' : 'Signing approve + sell…')
          : !isLoggedIn
            ? 'Connect wallet to trade'
            : overCap
              ? `Max $${maxBet.toFixed(0)} per bet`
              : insufficient
                ? 'Insufficient USDC balance'
              : mode === 'buy'
                ? `Approve + Buy ${side === 1 ? 'YES' : 'NO'}`
                : `Approve + Sell ${side === 1 ? 'YES' : 'NO'}`}
      </button>
    </Modal>
  )
}
