import { useState } from 'react'

interface TradeBoxProps {
  yesOption: string
  noOption: string
}

const quickButtons = ['+$1', '+$20', '+$100', 'Max']

// Buy/Sell panel:
// - Buy/Sell tab switch flips the input label between "Amount" and "Shares"
// - quick buttons add their numeric value to the input ("Max" adds 0)
export default function TradeBox({ yesOption, noOption }: TradeBoxProps) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('0')

  const addAmount = (label: string) => {
    const digits = label.replace(/[^0-9]/g, '')
    const current = parseInt(amount || '0', 10)
    const add = parseInt(digits || '0', 10)
    setAmount(String((Number.isNaN(current) ? 0 : current) + (Number.isNaN(add) ? 0 : add)))
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
        <button className="option yes active">{yesOption}</button>
        <button className="option no">{noOption}</button>
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

      <button className="trade-button">Trade</button>
    </div>
  )
}
