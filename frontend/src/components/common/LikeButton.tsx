import { useEffect, useRef, useState } from 'react'
import { getLikes, toggleLike } from '../../lib/api'
import { useWallet } from '../../hooks/useWallet'

// Heart with a live count for a market. Optimistic toggle; requires a connected
// wallet (prompts login otherwise). `initialCount` comes from /api/markets so the
// count renders instantly; the per-user `liked` state loads once the address is known.
export default function LikeButton({ marketId, initialCount = 0, className }: {
  marketId: number | string
  initialCount?: number
  className?: string
}) {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const [count, setCount] = useState(initialCount)
  const [liked, setLiked] = useState(false)
  const busy = useRef(false)

  useEffect(() => { setCount(initialCount) }, [initialCount])

  useEffect(() => {
    if (!address) { setLiked(false); return }
    getLikes(marketId, address)
      .then((r) => { setCount(r.count); setLiked(r.liked) })
      .catch(() => {})
  }, [marketId, address])

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isLoggedIn || !address) { promptLogin(); return }
    if (busy.current) return
    busy.current = true
    const prev = { count, liked }
    setLiked(!liked)
    setCount((c) => c + (liked ? -1 : 1))
    try {
      const r = await toggleLike(address, marketId)
      setLiked(r.liked)
      setCount(r.count)
    } catch {
      setLiked(prev.liked)
      setCount(prev.count)
    } finally {
      busy.current = false
    }
  }

  return (
    <a
      href="#"
      role="button"
      aria-pressed={liked}
      className={className ?? `text-decoration-none d-flex align-items-center fw-light ${liked ? 'text-danger' : 'text-muted'}`}
      onClick={onClick}
    >
      <span className="material-icons md-20 me-1">{liked ? 'favorite' : 'favorite_border'}</span>
      <span>{count}</span>
    </a>
  )
}
