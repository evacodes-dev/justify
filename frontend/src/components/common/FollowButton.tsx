import { useEffect, useRef, useState } from 'react'
import Modal from 'react-bootstrap/Modal'
import { getFollows, toggleFollow } from '../../lib/api'
import { useWallet } from '../../hooks/useWallet'

interface FollowButtonProps {
  // creator to (un)follow — display name or 0x address
  target: string
  initialFollowing?: boolean
  // fires after a successful server toggle with the fresh followers count
  onToggled?: (following: boolean, followers: number) => void
}

// Real follow toggle backed by /api/follow. Unfollow always goes through a
// confirmation modal (product decision from the 14.06 call).
export default function FollowButton({ target, initialFollowing = false, onToggled }: FollowButtonProps) {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const [following, setFollowing] = useState(initialFollowing)
  const [confirming, setConfirming] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    if (!address || !target) return
    getFollows(target, address)
      .then((r) => setFollowing(r.following))
      .catch(() => {})
  }, [target, address])

  const doToggle = async () => {
    if (!address || busy.current) return
    busy.current = true
    const prev = following
    setFollowing(!prev)
    try {
      const r = await toggleFollow(address, target)
      setFollowing(r.following)
      onToggled?.(r.following, r.followers)
    } catch {
      setFollowing(prev)
    } finally {
      busy.current = false
    }
  }

  const onClick = (e: React.MouseEvent) => {
    // FollowButton often sits inside a profile <Link> — don't navigate.
    e.preventDefault()
    e.stopPropagation()
    if (!isLoggedIn || !address) { promptLogin(); return }
    if (following) { setConfirming(true); return }
    void doToggle()
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn-sm px-3 rounded-pill ${following ? 'btn-primary' : 'btn-outline-primary'}`}
        onClick={onClick}
      >
        {following ? 'Following' : '+ Follow'}
      </button>

      <Modal
        show={confirming}
        onHide={() => setConfirming(false)}
        centered
        contentClassName="rounded-4 shadow-sm p-4 border-0 bg-brown-gradient"
      >
        <p className="text-body fw-bold mb-1">Unfollow @{target}?</p>
        <p className="text-muted small mb-3">Their markets and trades will no longer be prioritized in your feed.</p>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary rounded-5 flex-grow-1 fw-bold" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger rounded-5 flex-grow-1 fw-bold"
            onClick={() => { setConfirming(false); void doToggle() }}
          >
            Unfollow
          </button>
        </div>
      </Modal>
    </>
  )
}
