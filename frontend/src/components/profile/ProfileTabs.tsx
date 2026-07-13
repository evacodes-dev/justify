import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import UserPostCard from '../feed/UserPostCard'
import MarketCard from '../market/MarketCard'
import EmptyState from '../common/EmptyState'
import { getPosts, getLikedMarketIds, getMentions, type UserPost, type Mention } from '../../lib/api'
import { useMarkets } from '../../hooks/useMarkets'
import { toUiMarket } from '../../lib/markets'
import { timeAgo } from '../../lib/time'
import MentionText from '../common/MentionText'

type Tab = 'vogel' | 'liked' | 'mentions'

// Profile content tabs: Vogel (the user's text posts), Liked (markets they liked),
// Mentions (@name in posts and comments).
export default function ProfileTabs({ name, address }: { name: string; address?: string }) {
  const [tab, setTab] = useState<Tab>('vogel')
  const [posts, setPosts] = useState<UserPost[] | null>(null)
  const [likedIds, setLikedIds] = useState<number[] | null>(null)
  const [mentions, setMentions] = useState<Mention[] | null>(null)
  const { markets } = useMarkets()

  useEffect(() => {
    setPosts(null); setLikedIds(null); setMentions(null)
    getPosts(name).then((b) => setPosts(b.posts)).catch(() => setPosts([]))
    if (address) getLikedMarketIds(address).then((b) => setLikedIds(b.marketIds)).catch(() => setLikedIds([]))
    getMentions(name).then((b) => setMentions(b.mentions)).catch(() => setMentions([]))
  }, [name, address])

  const likedRows = markets.filter((m) => (likedIds ?? []).includes(m.demo.id))
  const spinner = <div className="text-center py-4"><div className="spinner-border" role="status" /></div>

  const tabsDef: { id: Tab; label: string }[] = [
    { id: 'vogel', label: `Vogel${posts ? ` (${posts.length})` : ''}` },
    { id: 'liked', label: 'Liked' },
    { id: 'mentions', label: 'Mentions' },
  ]

  return (
    <div className="mt-2">
      <ul className="nav nav-pills justify-content-center nav-justified mb-3 shadow-sm rounded-4 overflow-hidden bg-dark-glass mx-lg-3">
        {tabsDef.map((t) => (
          <li className="nav-item" key={t.id}>
            <button
              className={`p-3 nav-link text-muted text-uppercase small fw-bold ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      {tab === 'vogel' && (
        posts === null ? spinner : posts.length ? (
          <div>{posts.map((p) => <UserPostCard key={p.id} post={p} />)}</div>
        ) : (
          <EmptyState icon="edit_note" title="No posts yet" hint="Ideas posted from the feed will appear here." />
        )
      )}

      {tab === 'liked' && (
        likedIds === null ? spinner : likedRows.length ? (
          <div className="feeds px-lg-3">
            {likedRows.map((m) => (
              <MarketCard key={m.demo.id} market={toUiMarket(m.demo, { yesPct: Math.round(m.api.priceYes * 100), total: m.api.volume, resolved: m.api.resolved, likes: m.api.likes })} />
            ))}
          </div>
        ) : (
          <EmptyState icon="favorite_border" title="No liked markets" hint="Tap the heart on a market to save it here." />
        )
      )}

      {tab === 'mentions' && (
        mentions === null ? spinner : mentions.length ? (
          <div className="px-lg-3">
            {mentions.map((m) => (
              <div key={`${m.kind}-${m.id}`} className="bg-glass rounded-4 shadow-sm p-3 mb-2">
                <div className="d-flex align-items-center mb-1">
                  <img src={m.avatar} className="rounded-circle" style={{ width: 28, height: 28 }} alt="" />
                  <Link to={`/${m.name}`} className="text-decoration-none text-body fw-bold ms-2">{m.name}</Link>
                  <span className="text-muted small ms-2">
                    {m.kind === 'comment' && m.marketId != null
                      ? <>commented on <Link to={`/trade/m/${m.marketId}`} className="text-primary text-decoration-none">market #{m.marketId}</Link></>
                      : 'posted'}
                  </span>
                  <span className="text-muted small ms-auto">{timeAgo(m.ts)}</span>
                </div>
                <p className="text-body small mb-0" style={{ wordBreak: 'break-word' }}><MentionText text={m.text} /></p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="alternate_email" title="No mentions yet" hint={`When someone writes @${name}, it lands here.`} />
        )
      )}
    </div>
  )
}
