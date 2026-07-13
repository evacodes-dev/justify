import { useEffect, useRef, useState } from 'react'
import RightSidebar from '../components/layout/RightSidebar'
import AccountSlider from '../components/feed/AccountSlider'
import AccountListItem from '../components/feed/AccountListItem'
import MarketCard from '../components/market/MarketCard'
import MarketFeedItem from '../components/feed/MarketFeedItem'
import UserPostCard from '../components/feed/UserPostCard'
import EventCard from '../components/feed/EventCard'
import EmptyState from '../components/common/EmptyState'
import { useUi } from '../components/layout/UiContext'
import { useMarkets, type MarketRow } from '../hooks/useMarkets'
import { useCreators } from '../hooks/useCreators'
import { useWallet } from '../hooks/useWallet'
import { toUiMarket } from '../lib/markets'
import { getActivityFeed, getPosts, type ActivityItem, type UserPost } from '../lib/api'
import type { Account } from '../types'

type Tab = 'feed' | 'people' | 'trending'

const tabs: { id: Tab; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'people', label: 'Creators' },
  { id: 'trending', label: 'Trending' },
]

const uiOf = (m: MarketRow) =>
  toUiMarket(m.demo, { yesPct: Math.round(m.api.priceYes * 100), total: m.api.volume, resolved: m.api.resolved, likes: m.api.likes, outcome: m.api.outcome, closeTime: m.api.closeTime })

function MarketGrid({ rows, sort, empty }: { rows: MarketRow[]; sort?: boolean; empty?: { title: string; hint?: string } }) {
  // Trending = client-side sort by volume, likes as the tie-breaker.
  const list = sort
    ? [...rows].sort((a, b) => (b.api.volume - a.api.volume) || ((b.api.likes ?? 0) - (a.api.likes ?? 0)))
    : rows
  if (!list.length) {
    return <EmptyState icon="candlestick_chart" title={empty?.title ?? 'No markets yet'} hint={empty?.hint ?? 'New markets from creators will show up here.'} />
  }
  return (
    <div className="feeds px-lg-3">
      {list.map((m) => <MarketCard key={m.demo.id} market={uiOf(m)} />)}
    </div>
  )
}

function PeopleSection({ title, accounts }: { title: string; accounts: Account[] }) {
  if (!accounts.length) return null
  return (
    <div className="border-bottom py-3 px-lg-3">
      <h6 className="mb-3 fw-bold text-body">{title}</h6>
      <div className="bg-glass rounded-4 overflow-hidden shadow-sm">
        {accounts.map((account, i) => (
          <AccountListItem key={account.id} account={account} borderBottom={i < accounts.length - 1} />
        ))}
      </div>
    </div>
  )
}

// Recent human trades + oracle resolutions (agent noise filtered out).
function ActivitySection({ accounts }: { accounts: Account[] }) {
  const [items, setItems] = useState<ActivityItem[]>([])
  useEffect(() => {
    let alive = true
    const load = () =>
      getActivityFeed()
        .then((b) => { if (alive) setItems((b.feed ?? []).filter((f) => f.kind !== 'agent').slice(0, 5)) })
        .catch(() => {})
    load()
    const t = setInterval(load, 15_000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  if (!items.length) return null
  return (
    <div className="mb-3">
      <h6 className="fw-bold text-body mb-2 px-lg-3">Recent activity</h6>
      {items.map((item) => <EventCard key={item.id} item={item} accounts={accounts} />)}
    </div>
  )
}

// "Post your crypto ideas" composer strip → opens the post modal.
function ComposerStrip() {
  const { openModal } = useUi()
  return (
    <div className="px-lg-3 mb-3">
      <div
        className="input-group shadow-sm rounded-4 overflow-hidden py-2 bg-glass"
        role="button"
        onClick={() => openModal('post')}
      >
        <span className="input-group-text material-icons border-0 bg-transparent text-primary">account_circle</span>
        <span className="form-control border-0 bg-transparent fw-light ps-1 text-muted">Post your crypto ideas</span>
        <span className="input-group-text bg-transparent border-0 material-icons text-primary">add_circle</span>
      </div>
    </div>
  )
}

type FeedEntry = { ts: number } & ({ kind: 'post'; post: UserPost } | { kind: 'market'; row: MarketRow })

export default function FeedPage() {
  const [activeTab, setActiveTab] = useState<Tab>('feed')
  const { markets, loading } = useMarkets()
  const creators = useCreators()
  const [posts, setPosts] = useState<UserPost[]>([])
  const { address: viewer } = useWallet()

  useEffect(() => {
    const load = () => getPosts(undefined, 30, viewer ?? undefined).then((b) => setPosts(b.posts)).catch(() => {})
    load()
    window.addEventListener('posts:changed', load)
    const t = setInterval(load, 20_000)
    return () => { window.removeEventListener('posts:changed', load); clearInterval(t) }
  }, [viewer])

  // merged social feed: text posts + markets-as-posts, newest first
  const entries: FeedEntry[] = [
    ...posts.map((p): FeedEntry => ({ ts: p.ts, kind: 'post', post: p })),
    ...markets.map((row): FeedEntry => ({ ts: row.api.createdAt ?? 0, kind: 'market', row })),
  ].sort((a, b) => b.ts - a.ts)

  // lazy pagination: render a window and grow it as the sentinel scrolls into view
  const PAGE = 8
  const [visible, setVisible] = useState(PAGE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const hasMore = visible < entries.length
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const obs = new IntersectionObserver(
      (es) => { if (es[0].isIntersecting) setVisible((v) => v + PAGE) },
      { rootMargin: '600px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, activeTab])

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12 border-start border-end">
        <div className="main-content">
          <ul className="top-osahan-nav-tab nav nav-pills justify-content-center nav-justified mb-4 shadow-sm rounded-4 overflow-hidden bg-dark-glass sticky-sidebar2 m-lg-3" role="tablist">
            {tabs.map((tab) => (
              <li className="nav-item" role="presentation" key={tab.id}>
                <button
                  className={activeTab === tab.id ? 'p-3 nav-link text-muted active' : 'p-3 nav-link text-muted'}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="tab-content">
            {activeTab === 'feed' && (
              <div className="tab-pane fade show active" role="tabpanel">
                <ComposerStrip />
                {creators.length > 0 && (
                  <div>
                    <div className="d-flex align-items-center justify-content-between mb-1 px-lg-3">
                      <h6 className="mb-0 fw-bold text-body">Creators</h6>
                    </div>
                    <AccountSlider accounts={creators} />
                  </div>
                )}
                <ActivitySection accounts={creators} />
                {loading && !entries.length ? (
                  <div className="text-center py-5"><div className="spinner-border" role="status" /></div>
                ) : entries.length ? (
                  <>
                    {entries.slice(0, visible).map((e) =>
                      e.kind === 'post'
                        ? <UserPostCard key={`p-${e.post.id}`} post={e.post} />
                        : <MarketFeedItem key={`m-${e.row.demo.id}`} ui={uiOf(e.row)} api={e.row.api} accounts={creators} />,
                    )}
                    {hasMore && (
                      <div ref={sentinelRef} className="text-center py-3">
                        <div className="spinner-border spinner-border-sm text-muted" role="status" />
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState icon="dynamic_feed" title="Nothing here yet" hint="Markets and posts from creators will show up here." />
                )}
              </div>
            )}
            {activeTab === 'people' && (
              <div className="tab-pane fade show active" role="tabpanel">
                <PeopleSection title="Verified creators" accounts={creators} />
                {creators.length === 0 && (
                  <EmptyState icon="group" title="No creators yet" hint="Verified creators will appear here once they join." />
                )}
              </div>
            )}
            {activeTab === 'trending' && (
              <div className="tab-pane fade show active" role="tabpanel">
                {loading ? (
                  <div className="text-center py-5"><div className="spinner-border" role="status" /></div>
                ) : (
                  <MarketGrid rows={markets} sort empty={{ title: 'Nothing trending yet', hint: 'Markets ranked by volume and likes will show up here.' }} />
                )}
              </div>
            )}
          </div>
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
