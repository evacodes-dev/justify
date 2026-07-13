import { useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import CommentItem from './CommentItem'
import ShareButton from '../common/ShareButton'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import { togglePostLike, postPostComment, type UserPost, type MarketComment } from '../../lib/api'
import { timeAgo } from '../../lib/time'
import MentionText from '../common/MentionText'

// A text post ("vogel") card in the feed / profile Vogel tab:
// author header → text → actions (like + comments count + share) → recent
// comments preview → quick comment box. Same social pattern as MarketFeedItem.
export default function UserPostCard({ post }: { post: UserPost }) {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()

  const [likes, setLikes] = useState(post.likes ?? 0)
  const [liked, setLiked] = useState(!!post.liked)
  const [comments, setComments] = useState<MarketComment[]>(post.recentComments ?? [])
  const [count, setCount] = useState(post.comments ?? (post.recentComments?.length ?? 0))
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const like = async () => {
    if (!isLoggedIn || !address) { promptLogin(); return }
    // optimistic flip; server is the source of truth on answer
    setLiked(!liked)
    setLikes((n) => n + (liked ? -1 : 1))
    try {
      const r = await togglePostLike(address, post.id)
      setLiked(r.liked)
      setLikes(r.count)
    } catch {
      setLiked(liked)
      setLikes(post.likes ?? 0)
    }
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    if (!isLoggedIn || !address) { promptLogin(); return }
    setSending(true)
    try {
      const r = await postPostComment({ address, postId: post.id, text })
      setDraft('')
      setCount(r.count)
      setComments((cur) => [...cur, r.comment].slice(-3))
    } catch (e) {
      toast.show((e as Error).message || 'Could not comment', { kind: 'error' })
    } finally {
      setSending(false)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void send() }
  }

  return (
    <div className="border-bottom py-3 px-lg-3">
      <div className="bg-glass p-3 feed-item rounded-4 shadow-sm">
        <div className="d-flex align-items-center mb-2">
          <Link to={`/${post.name}`}>
            <img src={post.avatar} className="img-fluid rounded-circle" style={{ width: 40, height: 40 }} alt="avatar" />
          </Link>
          <div className="ms-2 flex-grow-1" style={{ minWidth: 0 }}>
            <Link to={`/${post.name}`} className="text-decoration-none d-flex align-items-center">
              <span className="fw-bold text-body">{post.name}</span>
              {post.verified && (
                <span className="ms-1 material-icons bg-primary p-0 md-14 fw-bold text-white rounded-circle ov-icon">done</span>
              )}
              <small className="text-muted ms-2">@{post.name}</small>
            </Link>
          </div>
          <small className="text-muted">{timeAgo(post.ts)}</small>
        </div>
        <p className="text-body mb-2" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><MentionText text={post.text} /></p>

        <div className="d-flex align-items-center justify-content-between mb-2 px-1">
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className={`btn btn-link p-0 border-0 d-flex align-items-center fw-light small text-decoration-none ${liked ? 'text-danger' : 'text-muted'}`}
              onClick={like}
            >
              <span className="material-icons md-18 me-1">{liked ? 'favorite' : 'favorite_border'}</span>{likes}
            </button>
            <span className="text-muted d-flex align-items-center fw-light small">
              <span className="material-icons md-18 me-1">chat_bubble_outline</span>{count}
            </span>
          </div>
          <ShareButton url={`/${post.name}`} text={post.text.slice(0, 200)} />
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
