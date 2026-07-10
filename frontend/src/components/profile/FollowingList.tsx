import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import VerifiedBadge from '../common/VerifiedBadge'
import FollowButton from '../common/FollowButton'
import { getFollowing, type FollowedUser } from '../../lib/api'

// Creators the connected user follows (GET /api/following/:address).
export default function FollowingList({ address }: { address: `0x${string}` }) {
  const [list, setList] = useState<FollowedUser[]>([])

  const load = useCallback(() => {
    getFollowing(address).then((b) => setList(b.following)).catch(() => {})
  }, [address])

  useEffect(() => { load() }, [load])

  if (!list.length) return null
  return (
    <div className="border-bottom py-3 px-lg-3">
      <h6 className="fw-bold text-body mb-2">Following</h6>
      <div className="bg-glass rounded-4 overflow-hidden shadow-sm">
        {list.map((u, i) => (
          <div key={u.address} className={`p-3 d-flex align-items-center${i < list.length - 1 ? ' border-bottom' : ''}`}>
            <Link to={`/u/${u.name}`} className="flex-shrink-0">
              <img src={u.avatar || '/img/images.jpeg'} className="rounded-circle me-3" alt="avatar" style={{ width: 40, height: 40, objectFit: 'cover' }} />
            </Link>
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <p className="fw-bold mb-0 d-flex align-items-center text-truncate">
                <Link to={`/u/${u.name}`} className="text-decoration-none text-body text-truncate">{u.name}</Link>
                {u.verified && <VerifiedBadge />}
              </p>
              <code className="small text-muted">{u.address.slice(0, 6)}…{u.address.slice(-4)}</code>
            </div>
            <div className="ms-2 flex-shrink-0">
              {/* unfollow (with confirm) drops the row on the next load */}
              <FollowButton target={u.name || u.address} initialFollowing onToggled={load} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
