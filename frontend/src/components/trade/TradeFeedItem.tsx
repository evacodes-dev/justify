import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import Dropdown from 'react-bootstrap/Dropdown'
import { Link } from 'react-router-dom'
import type { TradeMarket } from '../../data/trade'
import type { Comment } from '../../types'
import { getComments, postComment, type MarketComment } from '../../lib/api'
import { useWallet } from '../../hooks/useWallet'
import { useToast } from '../common/Toast'
import CommentItem from '../feed/CommentItem'
import LikeButton from '../common/LikeButton'
import ShareButton from '../common/ShareButton'
import MarketChart from './MarketChart'
import TradeBox, { type LiveTrade } from './TradeBox'

// Sets an inline style with !important priority (React's style prop drops
// !important, but this relies on it to beat Bootstrap utilities).
function importantStyle(prop: string, value: string) {
  return (el: HTMLElement | null) => {
    el?.style.setProperty(prop, value, 'important')
  }
}

const timeAgo = (ts: number): string => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const toUiComment = (c: MarketComment): Comment => ({
  id: c.id, author: c.name, avatar: c.avatar, text: c.text, time: timeAgo(c.ts),
})

function TradeFeedMenu() {
  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        as="a"
        href="#"
        bsPrefix="no-caret"
        className="text-white text-decoration-none material-icons ms-2 md-20 rounded-circle bg-glass p-1"
      >
        more_vert
      </Dropdown.Toggle>
      <Dropdown.Menu className="fs-13 dropdown-menu-end bg-light-glass">
        <Dropdown.Item className="text-dark d-flex align-items-center" href="#">
          <span className="material-icons md-13 me-1">flag</span>Report
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}

// The trading-panel feed item: author header, market title, price chart, buy/sell box,
// action counters, share menu and (for live markets) real comments.
export default function TradeFeedItem({ market, live }: { market: TradeMarket; live?: LiveTrade }) {
  const { author } = market
  const { address, isLoggedIn, promptLogin } = useWallet()
  const toast = useToast()
  const [comments, setComments] = useState<MarketComment[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const loadComments = useCallback(() => {
    if (!live) return
    getComments(live.market.id).then((b) => setComments(b.comments)).catch(() => {})
  }, [live?.market.id]) // eslint-disable-line react-hooks/exhaustive-deps -- id is the identity

  useEffect(() => { loadComments() }, [loadComments])

  const send = async () => {
    if (!live || sending) return
    const text = draft.trim()
    if (!text) return
    if (!isLoggedIn || !address) { promptLogin(); return }
    setSending(true)
    try {
      await postComment({ address, marketId: live.market.id, text })
      setDraft('')
      loadComments()
    } catch (e) {
      toast.show((e as Error).message || 'Could not post the comment', { kind: 'error' })
    } finally {
      setSending(false)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void send() }
  }

  // pretty share URL when we know the creator, canonical market URL otherwise
  const shareUrl = live
    ? (live.market.creatorName ? `/${live.market.creatorName}/${live.market.id}` : `/trade/m/${live.market.id}`)
    : window.location.pathname
  const shareText = live ? live.market.question : market.title

  const uiComments: Comment[] = live ? comments.map(toUiComment) : market.comments

  return (
    <div className="border-bottom py-3 px-lg-3">
      <div className="bg-glass p-3 feed-item rounded-4 shadow-sm">
        <div className={market.wrapperClassName}>
          <img
            src={author.avatar}
            className={market.avatarClassName}
            alt="profile-img"
            ref={author.squareAvatar ? importantStyle('border-radius', '0px') : undefined}
          />
          <div className={market.innerClassName}>
            <div className="w-100">
              <div className="d-flex align-items-center justify-content-between">
                <Link to={`/${author.name}`} className="text-decoration-none d-flex align-items-center">
                  <h6 className="fw-bold mb-0 text-body">{author.name}</h6>
                  {author.verified && (
                    <span className="ms-2 material-icons bg-primary p-0 md-16 fw-bold text-white rounded-circle ov-icon">done</span>
                  )}
                  <small className="text-muted ms-2">{author.handle}</small>
                </Link>
                <div className="d-flex align-items-center small">
                  <p className="text-muted mb-0">{market.date}</p>
                  <TradeFeedMenu />
                </div>
              </div>
              <div className="my-2">
                {/* Justify Market Card Component */}
                <div className="market-container">
                  <div className="market-container">
                    <div className={market.headerClassName}>
                      <h2>{market.title}</h2>
                      <p className={market.metaClassName}>{market.meta}</p>
                    </div>
                    <MarketChart
                      marketId={market.chart?.marketId}
                      currentYesPct={market.chart?.currentYesPct}
                      resolved={market.chart?.resolved}
                    />
                    <TradeBox yesOption={market.yesOption} noOption={market.noOption} live={live} />
                  </div>
                  <div
                    className="d-flex align-items-center justify-content-between mb-2"
                    ref={importantStyle('margin-bottom', '15px')}
                  >
                    <div>
                      {live ? (
                        <LikeButton marketId={live.market.id} initialCount={live.market.likes} />
                      ) : (
                        <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light">
                          <span className="material-icons md-20 me-2">favorite_border</span>
                          <span>{market.likes}</span>
                        </a>
                      )}
                    </div>
                    <div>
                      <span className="text-muted d-flex align-items-start fw-light">
                        <span className="material-icons md-20 me-2">chat_bubble_outline</span>
                        <span>{live ? comments.length : market.commentsCount}</span>
                      </span>
                    </div>
                    <div>
                      <ShareButton url={shareUrl} text={shareText} />
                    </div>
                  </div>
                  <div className="d-flex align-items-center mb-3">
                    <span className="material-icons bg-transparent border-0 text-primary pe-2 md-36">account_circle</span>
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-3 fw-light bg-glass form-control-text"
                      placeholder={isLoggedIn ? 'Write your comment' : 'Sign in to comment'}
                      value={draft}
                      maxLength={500}
                      disabled={!live || sending}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onKey}
                      onFocus={() => { if (!isLoggedIn) promptLogin() }}
                    />
                    <button
                      type="button"
                      className="btn btn-link text-primary p-0 ms-2 material-icons"
                      disabled={!live || sending || !draft.trim()}
                      onClick={() => void send()}
                      aria-label="Send comment"
                    >
                      send
                    </button>
                  </div>
                  <div className="comments">
                    {uiComments.map((comment) => (
                      <CommentItem key={comment.id} comment={comment} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
