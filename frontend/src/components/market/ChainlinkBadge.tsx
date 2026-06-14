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

// Live, verifiable Chainlink price for a price market: reads the real on-chain Data
// Feed and links to the same aggregator on Etherscan so anyone can verify the number.
export default function ChainlinkBadge({ question }: { question: string }) {
  const asset = detectAsset(question)
  const [p, setP] = useState<ChainlinkPrice | null>(null)
  useEffect(() => {
    if (!asset) return
    getChainlinkPrice(asset).then(setP).catch(() => {})
  }, [asset])
  if (!asset || !p) return null
  return (
    <div className="d-flex align-items-center flex-wrap gap-2 small p-2 rounded-3" style={{ background: '#375bd215', border: '1px solid #375bd244' }}>
      <span style={{ color: '#375bd2' }}>
        Chainlink {asset}/USD: <b>${p.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b> <span className="text-muted">(live, {p.network})</span>
      </span>
      <a href={p.explorer} target="_blank" rel="noreferrer" className="text-decoration-none ms-auto" style={{ color: '#375bd2' }}>
        verify feed on Etherscan ↗
      </a>
    </div>
  )
}
