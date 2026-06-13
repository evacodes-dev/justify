import { Link } from 'react-router-dom'
import { marketMovers } from '../../data/trending'
import { whoToFollow } from '../../data/accounts'
import VerifiedBadge from '../common/VerifiedBadge'
import FollowButton from '../common/FollowButton'
import { useWideLayout } from './wideLayout'
import type { ReactNode } from 'react'

function SearchBox() {
  return (
    <div className="input-group mb-4 shadow-sm rounded-4 overflow-hidden py-2 bg-glass">
      <span className="input-group-text material-icons border-0 bg-transparent text-primary">search</span>
      <input type="text" className="form-control border-0 bg-transparent fw-light ps-1" placeholder="Search Justify" />
    </div>
  )
}

function MarketMovers() {
  return (
    <div className="bg-glass rounded-4 overflow-hidden shadow-sm mb-4">
      <h6 className="fw-bold text-body p-3 mb-0 border-bottom">Market Movers</h6>
      {marketMovers.map((item) => (
        <Link
          key={item.id}
          to="/market"
          className="p-3 border-bottom d-flex align-items-center text-dark text-decoration-none trending-item"
        >
          <div>
            <div className="text-muted fw-light d-flex align-items-center">
              <small>{item.author}</small>
              <span className="mx-1 material-icons md-3">circle</span>
              <small>Live</small>
            </div>
            <p className="fw-bold text-white mb-0 pe-3">{item.title}</p>
            <small className="text-muted">Trending with</small>
            <br />
            <span className="text-primary">{item.tags}</span>
          </div>
          <img src={item.image} className="img-fluid rounded-4 ms-auto" alt="profile-img" />
        </Link>
      ))}
      <Link to="/market" className="text-decoration-none text-primary">
        <div className="p-3">Show More</div>
      </Link>
    </div>
  )
}

function WhoToFollow() {
  return (
    <div className="bg-glass rounded-4 overflow-hidden shadow-sm account-follow mb-4">
      <h6 className="fw-bold text-body p-3 mb-0 border-bottom">Who to follow</h6>
      {whoToFollow.map((account, i) => (
        <div
          key={account.id}
          className={`p-3 d-flex text-dark text-decoration-none account-item${i < whoToFollow.length - 1 ? ' border-bottom' : ''}`}
        >
          <Link to="/profile">
            <img src={account.avatar} className="img-fluid rounded-circle me-3" alt="profile-img" />
          </Link>
          <div>
            <p className="fw-bold mb-0 pe-3 d-flex align-items-center">
              <Link className="text-decoration-none text-white" to="/profile">
                {account.name}
              </Link>
              {account.verified && <VerifiedBadge />}
            </p>
            <div className="text-muted fw-light">
              <p className="mb-1 small">{account.handle}</p>
              {account.promoted ? (
                <span className="text-muted d-flex align-items-center small">
                  <span className="material-icons me-1 small">open_in_new</span>Promoted
                </span>
              ) : (
                <span className="text-muted d-flex align-items-center small">{account.bio}</span>
              )}
            </div>
          </div>
          <div className="ms-auto">
            <FollowButton />
          </div>
        </div>
      ))}
    </div>
  )
}

interface RightSidebarProps {
  children?: ReactNode
}

// Right column: search + Market Movers + Who to follow (default), or custom page content
export default function RightSidebar({ children }: RightSidebarProps) {
  // Trade pages narrow this column to col-xxl-2 to match the col-xxl-8 main.
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
              <SearchBox />
              <MarketMovers />
              <WhoToFollow />
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export { SearchBox, MarketMovers, WhoToFollow }
