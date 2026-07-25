import { Link } from 'react-router-dom'
import VerifiedBadge from '../common/VerifiedBadge'
import FollowButton from '../common/FollowButton'
import { useWideLayout } from './wideLayout'
import { useMarkets } from '../../hooks/useMarkets'
import { useCreators } from '../../hooks/useCreators'
import type { ReactNode } from 'react'

function MarketMovers() {
  const { markets } = useMarkets()
  const top = [...markets].sort((a, b) => b.api.volume - a.api.volume).slice(0, 4)
  if (!top.length) return null
  return (
    <div className="bg-glass rounded-4 overflow-hidden shadow-sm mb-4">
      <h6 className="fw-bold text-body p-3 mb-0 border-bottom">Market Movers</h6>
      {top.map(({ demo, api }) => (
        <Link
          key={demo.id}
          to={`/trade/m/${demo.id}`}
          className="p-3 border-bottom d-block text-dark text-decoration-none trending-item"
        >
          <div className="d-flex align-items-center mb-2">
            <img src={demo.thumb} className="rounded-3 flex-shrink-0 me-2" alt="" style={{ width: 28, height: 28, objectFit: 'cover' }} />
            <small className="text-muted fw-light text-truncate">@{demo.author ?? 'justify'}</small>
            <span className="mx-1 material-icons md-3 text-muted">circle</span>
            <small className="text-muted fw-light flex-shrink-0">{api.resolved ? 'Resolved' : 'Live'}</small>
          </div>
          <p className="fw-bold text-white mb-1">{demo.question}</p>
          <small className="text-muted d-block">{Math.round(api.priceYes * 100)}% YES · ${api.volume.toFixed(2)} Vol</small>
          <span className="text-primary small">{demo.tags}</span>
        </Link>
      ))}
      <Link to="/market" className="text-decoration-none text-primary">
        <div className="p-3">Show More</div>
      </Link>
    </div>
  )
}

function WhoToFollow() {
  const creators = useCreators()
  if (!creators.length) return null
  const shown = creators.slice(0, 5)
  return (
    <div className="bg-glass rounded-4 overflow-hidden shadow-sm account-follow mb-4">
      <h6 className="fw-bold text-body p-3 mb-0 border-bottom">Who to follow</h6>
      {shown.map((account, i) => (
        <div
          key={account.id}
          className={`p-3 d-flex text-dark text-decoration-none account-item${i < shown.length - 1 ? ' border-bottom' : ''}`}
        >
          <Link to={`/u/${account.name}`} className="flex-shrink-0">
            <img src={account.avatar} className="rounded-circle me-3" alt="profile-img" style={{ width: 40, height: 40, objectFit: 'cover', flexShrink: 0 }} />
          </Link>
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <p className="fw-bold mb-0 pe-2 d-flex align-items-center text-truncate">
              <Link className="text-decoration-none text-white text-truncate" to={`/u/${account.name}`}>{account.name}</Link>
              {account.verified && <VerifiedBadge />}
            </p>
            <div className="text-muted fw-light">
              <p className="mb-1 small text-truncate">{account.handle}</p>
              <span className="text-muted d-flex align-items-center small text-truncate">{account.bio || 'verified human'}</span>
            </div>
          </div>
          <div className="ms-auto ps-2 flex-shrink-0">
            <FollowButton target={account.name} />
          </div>
        </div>
      ))}
    </div>
  )
}

interface RightSidebarProps {
  children?: ReactNode
}

// Right column: Market Movers + Who to follow (default), or custom page content
export default function RightSidebar({ children }: RightSidebarProps) {
  const wide = useWideLayout()
  return (
    <aside
      className={
        wide
          ? 'col col-xxl-2 col-xl-3 order-xl-3 col-lg-12 order-lg-3 col-12'
          : 'col col-xl-3 order-xl-3 col-lg-12 order-lg-3 col-12'
      }
    >
      <div className="fix-sidebar ps-3 py-3 pe-0">
        <div className="side-trend lg-none">
          {children ?? (
            <div className="sticky-sidebar2 mb-3">
              <MarketMovers />
              <WhoToFollow />
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export { MarketMovers, WhoToFollow }
