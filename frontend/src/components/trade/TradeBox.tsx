import { useState } from 'react'
import { useArcMarket } from '../../hooks/useArcMarket'
import { useWallet } from '../../hooks/useWallet'
import { useUi } from '../layout/UiContext'

export interface LiveTrade {
  address: `0x${string}`
  question: string
}

interface TradeBoxProps {
  yesOption: string
  noOption: string
  // When set, the YES/NO options select a side and Trade opens the trade modal
  // for a real on-chain bet.
  live?: LiveTrade
}

const quickButtons = ['+$1', '+$20', '+$100', 'Max']

// Buy/Sell panel:
// - Buy/Sell tab switch flips the input label between "Amount" and "Shares"
// - quick buttons add their numeric value to the input ("Max" adds 0)
// With `live`, YES/NO becomes a side selector and Trade opens the trade modal.
export default function TradeBox({ yesOption, noOption, live }: TradeBoxProps) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('0')
  const [side, setSide] = useState<0 | 1>(1) // 1 = YES, 0 = NO

  const { address } = useWallet()
  const { state } = useArcMarket(live?.address, address)
  const { openTrade } = useUi()
  const resolved = !!state?.resolved

  const addAmount = (label: string) => {
    const digits = label.replace(/[^0-9]/g, '')
    const current = parseInt(amount || '0', 10)
    const add = parseInt(digits || '0', 10)
    setAmount(String((Number.isNaN(current) ? 0 : current) + (Number.isNaN(add) ? 0 : add)))
  }

  const onTrade = () => {
    if (!live) return
    openTrade({ address: live.address, question: live.question, side, yesPct: state?.yesPct ?? 50 })
  }

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
        <label>{mode === 'buy' ? 'Amount' : 'Shares'}</label>
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

      <button className="trade-button" onClick={live ? onTrade : undefined} disabled={live && resolved}>
        {live && resolved ? 'Market resolved' : 'Trade'}
      </button>
    </div>
  )
}
