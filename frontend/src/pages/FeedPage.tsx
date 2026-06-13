import { useState } from 'react'
import RightSidebar from '../components/layout/RightSidebar'
import AccountSlider from '../components/feed/AccountSlider'
import AccountListItem from '../components/feed/AccountListItem'
import PostCard from '../components/feed/PostCard'
import PostComposerBar from '../components/feed/PostComposerBar'
import {
  creatorAccounts,
  peopleYouCanFollow,
  popularPeople,
  newsChannels,
  politicians,
} from '../data/accounts'
import { feedPosts, trendingPosts } from '../data/posts'
import type { Account } from '../types'

type Tab = 'feed' | 'people' | 'trending'

const tabs: { id: Tab; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'people', label: 'People' },
  { id: 'trending', label: 'Trending' },
]

function PeopleSection({ title, accounts }: { title: string; accounts: Account[] }) {
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
                {/* Post Tab */}
                <PostComposerBar />
                {/* Follow People */}
                <div>
                  <div className="d-flex align-items-center justify-content-between mb-1 px-lg-3">
                    <h6 className="mb-0 fw-bold text-body">Follow Creators</h6>
                    <a href="#" className="text-white text-decoration-none material-icons">east</a>
                  </div>
                  {/* Slider Accounts */}
                  <AccountSlider accounts={creatorAccounts} />
                  {/* Feeds */}
                  <div className="feeds">
                    {feedPosts.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'people' && (
              <div className="tab-pane fade show active" role="tabpanel">
                <PeopleSection title="People you can follow" accounts={peopleYouCanFollow} />
                <PeopleSection title="Popular" accounts={popularPeople} />
                <PeopleSection title="News Papers & Channels" accounts={newsChannels} />
                <PeopleSection title="Politicians" accounts={politicians} />
              </div>
            )}
            {activeTab === 'trending' && (
              <div className="tab-pane fade show active" role="tabpanel">
                <PostComposerBar wrapperClassName="px-3" />
                <div className="feeds">
                  {trendingPosts.map((post) => (
                    <PostCard key={post.id} post={post} variant="compact" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="text-center mt-4">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mb-0 mt-2">Loading</p>
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
