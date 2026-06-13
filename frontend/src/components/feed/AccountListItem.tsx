import { Link } from 'react-router-dom'
import type { Account } from '../../types'
import VerifiedBadge from '../common/VerifiedBadge'

// Row item used in the "People" tab lists (links to the profile, static follow pill)
export default function AccountListItem({ account, borderBottom }: { account: Account; borderBottom?: boolean }) {
  return (
    <Link
      to="/profile"
      className={`p-3${borderBottom ? ' border-bottom' : ''} d-flex text-dark text-decoration-none account-item pf-item`}
    >
      <img src={account.avatar} className="img-fluid rounded-circle me-3" alt="profile-img" />
      <div>
        <p className="fw-bold mb-0 pe-3 d-flex align-items-center text-white">
          {account.name}
          {account.verified && <VerifiedBadge />}
        </p>
        <div className={account.promoted ? 'text-muted fw-light' : undefined}>
          <p className={account.promoted ? 'mb-1 small' : 'fw-light text-muted mb-1 small'}>{account.handle}</p>
          {account.promoted ? (
            <span className="text-muted d-flex align-items-center small">
              <span className="material-icons me-1 small">open_in_new</span>Promoted
            </span>
          ) : (
            <span className="d-flex align-items-center small text-white">{account.bio}</span>
          )}
        </div>
      </div>
      <div className="ms-auto">
        <span className="btn btn-outline-primary btn-sm px-3 rounded-pill">+ Follow</span>
      </div>
    </Link>
  )
}
