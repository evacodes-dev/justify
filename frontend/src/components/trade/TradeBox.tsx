import { useState } from 'react'
import { useCtfShares } from '../../hooks/useArcMarket'
import { useWallet } from '../../hooks/useWallet'
import { useUi } from '../layout/UiContext'
import type { ApiMarket } from '../../lib/markets'

export interface LiveTrade {
  market: ApiMarket
}

const quickButtons = ['+$1', '+$20', '+$100', 'Max']

// Buy/Sell panel over the Gnosis FPMM:
// - Buy: amount = USDC to spend. Sell: amount = USDC to receive (exit before resolve).
// - quick buttons add their numeric value to the input ("Max" adds 0)
// With `live`, YES/NO becomes a side selector and Trade opens the trade modal.
export default function TradeBox({ yesOption, noOption, live }: { yesOption: string; noOption: string; live?: LiveTrade }) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('0')
  const [side, setSide] = useState<0 | 1>(1) // 1 = YES, 0 = NO

  const { address } = useWallet()
  const { shares } = useCtfShares(live?.market, address)
  const { openTrade } = useUi()
  const resolved = !!live?.market.resolved
  const yesPct = live ? Math.round(live.market.priceYes * 100) : 50
  const sideShares = side === 1 ? shares?.yesShares ?? 0 : shares?.noShares ?? 0
  // Selling needs CTF position ids — absent on legacy (pre-CTF) markets.
  const canSell = !!(live?.market.posYes && live?.market.posNo)

  const addAmount = (label: string) => {
    const digits = label.replace(/[^0-9]/g, '')
    const current = parseInt(amount || '0', 10)
    const add = parseInt(digits || '0', 10)
    setAmount(String((Number.isNaN(current) ? 0 : current) + (Number.isNaN(add) ? 0 : add)))
  }

  const onTrade = () => {
    if (!live) return
    const typed = parseFloat(amount)
    openTrade({ market: live.market, side, mode, yesPct, amount: typed > 0 ? typed : undefined })
  }

  const disabled = (live && resolved) || (mode === 'sell' && !canSell)

  return (
    <div className="trade-box">
      <div className="trade-tabs">
        <button className={mode === 'buy' ? 'tab active' : 'tab'} onClick={() => setMode('buy')}>
          Buy
        </button>
        <button className={mode === 'sell' ? 'tab active' : 'tab'} onClick={() => setMode('sell')}>
          Sell
        </button>
        <div className="dropdown">Market ▼</div>
        <div className="stop-float"></div>
      </div>

      <div className="trade-options">
        <button
          className={`option yes${!live || side === 1 ? ' active' : ''}`}
          onClick={live ? () => setSide(1) : undefined}
        >
          {yesOption}
        </button>
        <button
          className={`option no${live && side === 0 ? ' active' : ''}`}
          onClick={live ? () => setSide(0) : undefined}
        >
          {noOption}
        </button>
      </div>

      <div className="trade-inputs">
        <label>{mode === 'buy' ? 'Amount' : 'You receive'}</label>
        <div className="amount-row">
          <span className="dollar">$</span>
          <input type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="quick-buttons">
          {quickButtons.map((label) => (
            <button key={label} onClick={() => addAmount(label)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {live && mode === 'sell' && shares && (
        <div className="small text-muted mb-2 mt-2">
          Your {side === 1 ? 'YES' : 'NO'} shares: <span className="text-body">{sideShares.toFixed(2)}</span>
        </div>
      )}
      <button className="trade-button" onClick={live && !disabled ? onTrade : undefined} disabled={disabled}>
        {live && resolved
          ? 'Market resolved'
          : mode === 'sell'
            ? (canSell ? 'Sell' : 'Sell unavailable')
            : 'Trade'}
      </button>
    </div>
  )
}
