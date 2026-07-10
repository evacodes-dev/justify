import { useEffect, useState } from 'react'
import RightSidebar from '../components/layout/RightSidebar'
import AccountSlider from '../components/feed/AccountSlider'
import AccountListItem from '../components/feed/AccountListItem'
import MarketCard from '../components/market/MarketCard'
import EventCard from '../components/feed/EventCard'
import EmptyState from '../components/common/EmptyState'
import { useMarkets, type MarketRow } from '../hooks/useMarkets'
import { useCreators } from '../hooks/useCreators'
import { toUiMarket } from '../lib/markets'
import { getActivityFeed, type ActivityItem } from '../lib/api'
import type { Account } from '../types'

type Tab = 'feed' | 'people' | 'trending'

const tabs: { id: Tab; label: string }[] = [
  { id: 'feed', label: 'Markets' },
  { id: 'people', label: 'Creators' },
  { id: 'trending', label: 'Trending' },
]

const uiOf = (m: MarketRow) =>
  toUiMarket(m.demo, { yesPct: Math.round(m.api.priceYes * 100), total: m.api.volume, resolved: m.api.resolved, likes: m.api.likes })

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
        .then((b) => { if (alive) setItems((b.feed ?? []).filter((f) => f.kind !== 'agent').slice(0, 12)) })
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

export default function FeedPage() {
  const [activeTab, setActiveTab] = useState<Tab>('feed')
  const { markets, loading } = useMarkets()
  const creators = useCreators()

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
                {creators.length > 0 && (
                  <div>
                    <div className="d-flex align-items-center justify-content-between mb-1 px-lg-3">
                      <h6 className="mb-0 fw-bold text-body">Creators</h6>
                    </div>
                    <AccountSlider accounts={creators} />
                  </div>
                )}
                <ActivitySection accounts={creators} />
                {loading ? (
                  <div className="text-center py-5"><div className="spinner-border" role="status" /></div>
                ) : (
                  <MarketGrid rows={markets} />
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
