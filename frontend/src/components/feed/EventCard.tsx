import { Link } from 'react-router-dom'
import VerifiedBadge from '../common/VerifiedBadge'
import type { ActivityItem } from '../../lib/api'
import type { Account } from '../../types'

const sideOf = (outcome?: number) => (outcome === 1 ? 'YES' : outcome === 0 ? 'NO' : 'INVALID')

function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

// Unified feed event card: avatar + name (verified badge) → action → time → market link.
// Trades show "bought YES for $12 in …"; resolutions show the oracle badge.
export default function EventCard({ item, accounts }: { item: ActivityItem; accounts?: Account[] }) {
  const isTrade = item.kind === 'trade'
  // enrich trades with the creator list we already have (avatar + verified)
  const known = isTrade ? accounts?.find((a) => a.name === item.user) : undefined

  return (
    <div className="bg-glass p-3 feed-item rounded-4 shadow-sm mb-3 mx-lg-3">
      <div className="d-flex align-items-center">
        {isTrade ? (
          <img src={known?.avatar || '/img/images.jpeg'} className="rounded-circle me-3" alt="avatar" style={{ width: 40, height: 40, objectFit: 'cover' }} />
        ) : (
          <span className="material-icons text-primary me-3 bg-dark-glass rounded-circle p-2">gavel</span>
        )}
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <p className="mb-0 text-body d-flex align-items-center flex-wrap">
            {isTrade ? (
              <>
                <Link to={`/u/${item.user}`} className="fw-bold text-decoration-none text-body">{item.user}</Link>
                {known?.verified && <VerifiedBadge />}
                <span className="text-muted ms-1">
                  bought {sideOf(item.outcome)}{item.amountUsdc != null ? ` for $${item.amountUsdc.toFixed(2)}` : ''}
                </span>
              </>
            ) : (
              <>
                <span className="fw-bold">Oracle</span>
                <span className="badge bg-secondary ms-2">resolution</span>
                <span className={`ms-2 fw-bold ${item.outcome === 1 ? 'text-success' : item.outcome === 0 ? 'text-danger' : 'text-warning'}`}>
                  {sideOf(item.outcome)}
                </span>
              </>
            )}
            <span className="text-muted small ms-auto ps-2">{timeAgo(item.ts)}</span>
          </p>
          {item.marketId != null && (
            <Link to={`/trade/m/${item.marketId}`} className="text-muted small text-decoration-none text-truncate d-block">
              {item.marketQuestion}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
