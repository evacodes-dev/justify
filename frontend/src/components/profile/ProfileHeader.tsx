import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import VerifiedBadge from '../common/VerifiedBadge'
import FollowButton from '../common/FollowButton'
import type { PublicUser, UserMarket } from '../../lib/api'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// Real profile header (connected user or any creator). Markets = the markets they created.
export default function ProfileHeader({ user, markets, isMe }: { user: PublicUser; markets: UserMarket[]; isMe?: boolean }) {
  const joined = new Date(user.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  const [followers, setFollowers] = useState(user.followers ?? 0)
  useEffect(() => { setFollowers(user.followers ?? 0) }, [user.followers])
  return (
    <div className="border-bottom py-3 px-lg-3">
      <div className="bg-glass rounded-4 shadow-sm profile">
        <div className="d-flex align-items-center px-3 pt-3">
          <img src={user.avatar || '/img/images.jpeg'} className="img-fluid rounded-circle" alt="avatar" style={{ width: 64, height: 64, objectFit: 'cover' }} />
          <div className="ms-3">
            <h6 className="mb-0 d-flex align-items-center text-body fs-6 fw-bold">{user.name}{user.verified && <VerifiedBadge />}</h6>
            <p className="text-muted mb-0">@{user.name}</p>
          </div>
          <div className="ms-auto">
            {isMe
              ? <Link to="/edit-profile" className="btn btn-outline-secondary btn-sm rounded-4">Edit</Link>
              : <FollowButton target={user.name || user.address} onToggled={(_, n) => setFollowers(n)} />}
          </div>
        </div>
        <div className="p-3">
          {user.bio && <p className="mb-2 fs-6 text-body">{user.bio}</p>}
          <p className="d-flex align-items-center flex-wrap mb-2 text-muted small gap-3">
            <span className="d-flex align-items-center"><span className="material-icons me-1 md-16">calendar_today</span>Joined {joined}</span>
            <span><b className="text-body">{followers}</b> follower{followers === 1 ? '' : 's'}</span>
            <span><b className="text-body">{markets.length}</b> market{markets.length === 1 ? '' : 's'} created</span>
            {user.verified && <span className="text-success">✓ verified human</span>}
          </p>
          <code className="small text-muted text-break">{short(user.address)}</code>
        </div>
      </div>

      {markets.length > 0 && (
        <div className="mt-3">
          <h6 className="fw-bold text-body mb-2">Markets by @{user.name}</h6>
          <div className="bg-glass rounded-4 overflow-hidden shadow-sm">
            {markets.map((m) => (
              <Link key={m.id} to={`/trade/m/${m.id}`} className="p-3 border-bottom d-flex align-items-center text-white text-decoration-none">
                <div className="flex-grow-1">
                  <p className="fw-bold mb-0 pe-2">{m.question}</p>
                  <small className="text-muted">{Math.round(m.priceYes * 100)}% YES · ${m.volume.toFixed(2)} Vol · {m.resolved ? 'Resolved' : 'Live'}</small>
                </div>
                <span className="material-icons text-muted">chevron_right</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
