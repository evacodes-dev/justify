import { useEffect, useState } from 'react'
import { getChainlinkPrice, type ChainlinkPrice } from '../../lib/api'

// Detect a Chainlink-feed asset from the market question.
function detectAsset(q: string): string | null {
  const s = q.toLowerCase()
  if (/\beth|ethereum\b/.test(s)) return 'ETH'
  if (/\bbtc|bitcoin\b/.test(s)) return 'BTC'
  if (/\blink|chainlink\b/.test(s)) return 'LINK'
  return null
}

export interface PriceRule { asset: string; threshold: number; comparator: 'above' | 'below' }

// The Chainlink rule behind a price market.
//
// While the market is open, the live feed reading is the useful number — but only from the
// feed on the SETTLEMENT chain, since that is the aggregator `CtfResolver.resolveByPrice`
// reads in-contract. Once the market has resolved, a live price is actively misleading: it
// keeps moving after the outcome was fixed, so the badge switches to the committed rule and
// the outcome that rule produced.
export default function ChainlinkBadge({
  question, rule, resolved, outcome,
}: {
  question: string
  rule?: PriceRule | null
  resolved?: boolean
  outcome?: 'YES' | 'NO' | 'INVALID' | null
}) {
  const asset = rule?.asset?.toUpperCase() ?? detectAsset(question)
  const [p, setP] = useState<ChainlinkPrice | null>(null)

  useEffect(() => {
    if (!asset || resolved) return
    getChainlinkPrice(asset).then(setP).catch(() => {})
  }, [asset, resolved])

  if (!asset) return null

  const ruleText = rule
    ? `${asset}/USD ${rule.comparator === 'below' ? '<' : '>'} $${rule.threshold.toLocaleString()} at close`
    : `${asset}/USD at close`

  return (
    <div
      className="d-flex align-items-center flex-wrap gap-2 small p-2 rounded-3"
      style={{ background: '#375bd215', border: '1px solid #375bd244' }}
    >
      <span style={{ color: '#375bd2' }}>
        Chainlink <b>{ruleText}</b>
        {resolved && outcome && <span className="text-muted"> → resolved {outcome}</span>}
        {!resolved && p && (
          <span className="text-muted">
            {' '}· now{' '}
            <b style={{ color: '#375bd2' }}>
              ${p.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </b>{' '}
            on {p.network}
          </span>
        )}
      </span>
      {p && (
        <a href={p.explorer} target="_blank" rel="noreferrer" className="text-decoration-none ms-auto" style={{ color: '#375bd2' }}>
          verify feed ↗
        </a>
      )}
    </div>
  )
}