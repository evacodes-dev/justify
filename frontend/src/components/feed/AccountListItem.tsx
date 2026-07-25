import { Link } from 'react-router-dom'
import type { Account } from '../../types'
import VerifiedBadge from '../common/VerifiedBadge'
import FollowButton from '../common/FollowButton'

// Row item used in the "People" tab lists (links to the profile, live follow toggle)
export default function AccountListItem({ account, borderBottom }: { account: Account; borderBottom?: boolean }) {
  return (
    <Link
      to={`/u/${account.name}`}
      className={`p-3${borderBottom ? ' border-bottom' : ''} d-flex text-dark text-decoration-none account-item pf-item`}
    >
      <img src={account.avatar} className="rounded-circle me-3" alt="profile-img" style={{ width: 48, height: 48, objectFit: 'cover', flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <p className="fw-bold mb-0 pe-3 d-flex align-items-center text-white">
          @{account.name}
          {account.verified && <VerifiedBadge />}
        </p>
        {account.promoted && (
          <span className="text-muted d-flex align-items-center small">
            <span className="material-icons me-1 small">open_in_new</span>Promoted
          </span>
        )}
      </div>
      <div className="ms-auto">
        <FollowButton target={account.name} />
      </div>
    </Link>
  )
}
