import { useState } from 'react'
import RightSidebar from '../components/layout/RightSidebar'
import AccountSlider from '../components/feed/AccountSlider'
import AccountListItem from '../components/feed/AccountListItem'
import MarketCard from '../components/market/MarketCard'
import ReasoningFeed from '../components/feed/ReasoningFeed'
import { useMarkets, type MarketRow } from '../hooks/useMarkets'
import { useCreators } from '../hooks/useCreators'
import { toUiMarket } from '../lib/markets'
import type { Account } from '../types'

type Tab = 'feed' | 'agents' | 'people' | 'trending'

const tabs: { id: Tab; label: string }[] = [
  { id: 'feed', label: 'Markets' },
  { id: 'agents', label: '🤖 Agents' },
  { id: 'people', label: 'Creators' },
  { id: 'trending', label: 'Trending' },
]

const uiOf = (m: MarketRow) =>
  toUiMarket(m.demo, { yesPct: Math.round(m.api.priceYes * 100), total: m.api.volume, resolved: m.api.resolved })

function MarketGrid({ rows, sort }: { rows: MarketRow[]; sort?: boolean }) {
  const list = sort ? [...rows].sort((a, b) => b.api.volume - a.api.volume) : rows
  if (!list.length) return <p className="text-muted text-center py-5">No markets yet — create the first one.</p>
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
                {loading ? (
                  <div className="text-center py-5"><div className="spinner-border" role="status" /></div>
                ) : (
                  <MarketGrid rows={markets} />
                )}
              </div>
            )}
            {activeTab === 'agents' && (
              <div className="tab-pane fade show active" role="tabpanel">
                <ReasoningFeed />
              </div>
            )}
            {activeTab === 'people' && (
              <div className="tab-pane fade show active" role="tabpanel">
                <PeopleSection title="Verified creators" accounts={creators} />
                {creators.length === 0 && <p className="text-muted text-center py-5">No creators yet — verify with World ID to become one.</p>}
              </div>
            )}
            {activeTab === 'trending' && (
              <div className="tab-pane fade show active" role="tabpanel">
                {loading ? (
                  <div className="text-center py-5"><div className="spinner-border" role="status" /></div>
                ) : (
                  <MarketGrid rows={markets} sort />
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
