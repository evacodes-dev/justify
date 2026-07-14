import { useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import MarketCard from '../market/MarketCard'
import CommentItem from './CommentItem'
import ShareButton from '../common/ShareButton'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import { postComment, type MarketComment } from '../../lib/api'
import { timeAgo } from '../../lib/time'
import type { Market } from '../../types'
import type { ApiMarket } from '../../lib/markets'
import type { Account } from '../../types'

// A market as a social feed post: creator header → market card → actions
// (comments count + share) → last comments preview → quick comment box.
export default function MarketFeedItem({
  ui, api, accounts,
}: { ui: Market; api: ApiMarket; accounts: Account[] }) {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()
  const creator = accounts.find((a) => a.name.toLowerCase() === (api.creatorName ?? '').toLowerCase())
  const [comments, setComments] = useState<MarketComment[]>(api.recentComments ?? [])
  const [count, setCount] = useState(api.comments ?? (api.recentComments?.length ?? 0))
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    if (!isLoggedIn || !address) { promptLogin(); return }
    setSending(true)
    try {
      const r = await postComment({ address, marketId: api.id, text })
      setDraft('')
      setCount(r.count)
      // optimistic append (we know who we are)
      setComments((cur) => [...cur, { id: String(Date.now()), address, name: 'you', avatar: '/img/images.jpeg', verified: false, text, ts: Date.now() }].slice(-3))
    } catch (e) {
      toast.show((e as Error).message || 'Could not comment', { kind: 'error' })
    } finally {
      setSending(false)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void send() }
  }

  const shareUrl = api.creatorName ? `/${api.creatorName}/${api.id}` : `/trade/m/${api.id}`

  return (
    <div className="border-bottom py-3 px-lg-3">
      <div className="bg-glass p-3 feed-item rounded-4 shadow-sm">
        {api.creatorName && (
          <div className="d-flex align-items-center mb-2">
            <Link to={`/${api.creatorName}`}>
              <img src={creator?.avatar || '/img/images.jpeg'} className="img-fluid rounded-circle" style={{ width: 36, height: 36 }} alt="creator" />
            </Link>
            <Link to={`/${api.creatorName}`} className="text-decoration-none d-flex align-items-center ms-2 flex-grow-1">
              <span className="fw-bold text-body">{api.creatorName}</span>
              {(api.creatorVerified ?? creator?.verified) && (
                <span className="ms-1 material-icons bg-primary p-0 md-14 fw-bold text-white rounded-circle ov-icon">done</span>
              )}
              <small className="text-muted ms-2">@{api.creatorName}</small>
            </Link>
            {api.createdAt && <small className="text-muted">{timeAgo(api.createdAt)}</small>}
          </div>
        )}

        <MarketCard market={ui} />

        <div className="d-flex align-items-center justify-content-between mt-2 mb-2 px-1">
          <span className="text-muted d-flex align-items-center fw-light small">
            <span className="material-icons md-18 me-1">chat_bubble_outline</span>{count}
          </span>
          <ShareButton url={shareUrl} text={api.question} />
        </div>

        {comments.length > 0 && (
          <div className="comments mb-2">
            {comments.map((c) => (
              <CommentItem key={c.id} comment={{ id: c.id, author: c.name, avatar: c.avatar, text: c.text, time: timeAgo(c.ts) }} />
            ))}
          </div>
        )}

        <div className="d-flex align-items-center">
          <span className="material-icons bg-transparent border-0 text-primary pe-2 md-28">account_circle</span>
          <input
            type="text"
            className="form-control form-control-sm rounded-3 fw-light bg-glass form-control-text"
            placeholder={isLoggedIn ? 'Write your comment' : 'Sign in to comment'}
            value={draft}
            maxLength={500}
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onFocus={() => { if (!isLoggedIn) promptLogin() }}
          />
        </div>
      </div>
    </div>
  )
}
