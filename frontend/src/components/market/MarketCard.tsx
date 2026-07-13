import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Market } from '../../types'
import ChanceArc from './ChanceArc'
import LikeButton from '../common/LikeButton'

type Side = 'yes' | 'no'

// Flippable prediction-market card: front shows odds, back is the buy panel.
// Flip and payout calculation are driven by React state.
export default function MarketCard({ market }: { market: Market }) {
  const [side, setSide] = useState<Side | null>(null)
  const [amount, setAmount] = useState(10)
  const navigate = useNavigate()
  const tradeHref = `/trade/m/${market.id}`

  const price = side === 'yes' ? market.yesPrice : market.noPrice
  const payout = price > 0 && !Number.isNaN(amount) ? (amount / price).toFixed(2) : '0.00'
  const sideLabel = side === 'yes' ? 'Yes' : 'No'

  const open = (s: Side) => {
    setSide(s)
    setAmount(10)
  }

  return (
    <div className="market-container">
      <div className={side ? 'market-card flipped' : 'market-card'}>
        <div className="market-inner">
          <div className="market-front">
            <div className="market-header">
              <img src={market.thumb} alt="Market Thumbnail" className="market-thumb" />
              <div className="market-info">
                <div className="market-title">
                  <Link to={tradeHref}>{market.title}</Link>
                </div>
                <div className="market-description">{market.description}</div>
                <div className="market-meta d-flex align-items-center gap-2">
                  <span className="market-volume">{market.volume}</span>
                  <span className="market-time">{market.endTime}</span>
                  <LikeButton marketId={market.id} initialCount={market.likes} />
                </div>
              </div>
              <div className="market-chance">
                <ChanceArc chance={market.chance} />
              </div>
            </div>
            {market.resolved ? (
              <div className="market-actions">
                <Link
                  to={tradeHref}
                  className={`d-flex align-items-center justify-content-center gap-2 w-100 py-2 rounded-3 text-decoration-none fw-bold ${
                    market.outcome === 1 ? 'text-success' : market.outcome === 0 ? 'text-danger' : 'text-warning'
                  }`}
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <span className="material-icons md-18">verified</span>
                  Resolved · {market.outcome === 1 ? market.yesLabel.toUpperCase() : market.outcome === 0 ? market.noLabel.toUpperCase() : 'INVALID'}
                </Link>
              </div>
            ) : market.closed ? (
              <div className="market-actions">
                <Link
                  to={tradeHref}
                  className="d-flex align-items-center justify-content-center gap-2 w-100 py-2 rounded-3 text-decoration-none fw-bold text-warning"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <span className="material-icons md-18">hourglass_top</span>
                  Resolving — view status
                </Link>
              </div>
            ) : (
              <div className="market-actions">
                <button className="btn-yes buy-yes" onClick={() => open('yes')}>
                  Buy {market.yesLabel}
                </button>
                <button className="btn-no buy-no" onClick={() => open('no')}>
                  Buy {market.noLabel}
                </button>
              </div>
            )}
          </div>
          <div className="market-back">
            {side && (
              <>
                <div className="market-header">
                  <div className="market-title">{market.title}</div>
                  <button className="close-card" style={{ float: 'right' }} onClick={() => setSide(null)}>
                    ×
                  </button>
                </div>
                <div className="market-body">
                  <div className="input-slider-row">
                    <div className="input-row">
                      <input
                        type="number"
                        min={1}
                        value={amount}
                        onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
                      />
                      <button className="plus-btn" onClick={() => setAmount((a) => a + 1)}>+1</button>
                      <button className="plus-btn" onClick={() => setAmount((a) => a + 10)}>+10</button>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={amount}
                      onChange={(e) => setAmount(parseInt(e.target.value))}
                    />
                  </div>
                  <button className={`confirm-order btn-${side}`} onClick={() => navigate(tradeHref)}>
                    <div className="btn-title">
                      Buy <span className="side-label">{sideLabel}</span>
                    </div>
                    <div className="btn-payout">
                      To win: <span>${payout}</span>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
