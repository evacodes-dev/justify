import type { TradeMarket } from '../../data/trade'
import type { Account } from '../../types'
import { useUi } from '../layout/UiContext'
import AccountListItem from '../feed/AccountListItem'
import PostCard from '../feed/PostCard'
import { peopleYouCanFollow, popularPeople, newsChannels, politicians } from '../../data/accounts'
import { trendingPosts } from '../../data/posts'
import TradeFeedItem from './TradeFeedItem'

// Page-specific CSS for the trade pages. Injected only while a trade page is
// mounted so it doesn't leak into other routes.
const tradePageCss = `
      .market-container {
  max-width: 100%;
}

.market-header {
  text-align: center;
  margin-bottom: 20px;
}

.team-icon {
  width: 50px;
  vertical-align: middle;
}

.market-meta {
  color: #aaa;
  font-size: 0.9em;
}

.market-graph-section {
  background: #161b22;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 20px;
}

.chart-toggles {
  text-align: center;
  margin-top: 10px;
}

.chart-toggles button {
  background: transparent;
  border: none;
  color: #ccc;
  padding: 6px 12px;
  margin: 0 3px;
  cursor: pointer;
}

.chart-toggles .active {
  color: white;
  font-weight: bold;
  border-bottom: 2px solid white;
}

.market-trade {
  display: flex;
  justify-content: space-around;
  margin-top: 20px;
}

.market-buttons button {
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  font-size: 16px;
}

button.yes {
  background-color: #355E3B;
  color: white;
}

button.no {
  background-color: #B1332F;
  color: white;
}


.trade-box {
  padding: 20px;
  border-radius: 12px;
  max-width: 100%;
  color: white;
  font-family: 'Segoe UI', sans-serif;
   margin-bottom:25x;
}

.trade-tabs {
  display: block;
   margin-bottom: 25px;
}

         .stop-float {
  clear: both; /* Элемент не подвергнется обтеканию */
}

.trade-tabs .tab {
  background: transparent;
  border: none;
  font-weight: bold;
  color: #aaa;
  padding-bottom: 4px;
  cursor: pointer;
  font-size: 16px;
   float:left;
}

.trade-tabs .tab.active {
  color: white;
  border-bottom: 2px solid white;
}

.dropdown {
  font-size: 14px;
  color: #ccc;
   float:right;
}

.trade-options {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.option {
  flex: 1;
  margin: 0 4px;
  border: none;
  padding: 10px 0;
  border-radius: 8px;
  font-weight: bold;
  font-size: 16px;
  cursor: pointer;
  background: #1c2a3d;
  color: #ccc;
}

.option.active.yes {
  background: #355E3B;
  color: white;
}

.option.active.no {
  background: #c62828;
  color: white;
}

.trade-inputs label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  color: #ccc;
}

.amount-row {
  display: flex;
  align-items: center;
  font-size: 24px;
  margin-bottom: 12px;
}

.dollar {
  margin-right: 4px;
  color: #aaa;
}

.amount-row input {
  background: transparent;
  border: none;
  border-bottom: 2px solid #ccc;
  font-size: 24px;
  color: white;
  width: 100%;
  outline: none;
}

.quick-buttons {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}

.quick-buttons button {
  flex: 1;
  background: #2a3547;
  border: none;
  border-radius: 6px;
  color: #ccc;
  padding: 6px 0;
  font-size: 14px;
  cursor: pointer;
}

.trade-button {
  width: 100%;
  background: #2196f3;
  color: white;
  font-weight: bold;
  font-size: 16px;
  padding: 10px 0;
  border: none;
  border-radius: 8px;
  margin-top: 16px;
  cursor: pointer;
}

@media (min-width: 768px) {
  .page-container {
    width: 80%;
  }
}

/* Keep the trading chart inside its card. The <canvas> backing store is sized
   for devicePixelRatio (2x on retina), so its intrinsic width is ~2x the
   rendered width. The feed item is a flex row (d-md-flex), and flex items
   default to min-width:auto — so the inner column grows to the canvas's
   oversized intrinsic width and pushes the whole card past the main column.
   min-width:0 lets the columns shrink to fit; max-width caps the canvas. */
.feed-item .d-md-flex > div,
.feed-item .d-md-flex .w-100 {
  min-width: 0;
}

#marketChart {
  display: block;
  max-width: 100%;
}
`

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

// Main column shared by TradePage and TradeFounderPage. Two extra tab panes
// ("people" and "trending") exist but have no pills nav, so they stay hidden
// (`tab-pane fade`).
export default function TradeContent({ market }: { market: TradeMarket }) {
  const { openModal } = useUi()
  return (
    <div className="main-content">
      <style>{tradePageCss}</style>
      <div className="tab-content" id="pills-tabContent">
        <div className="tab-pane fade show active" id="pills-feed" role="tabpanel" aria-labelledby="pills-feed-tab"></div>
        {/* Follow People */}
        <div>
          <div className="d-flex align-items-center justify-content-between mb-1 px-lg-3">
            <h6 className="mb-0 fw-bold text-body">Trading panel</h6>
            <a href="#" className="text-white text-decoration-none material-icons">east</a>
          </div>
          {/* Slider Accounts */}
          {/* Feeds */}
          <div className="feeds">
            {/* Feed Item */}
            <TradeFeedItem market={market} />
            {/* Feed Item */}
          </div>
        </div>
        <div className="tab-pane fade" id="pills-people" role="tabpanel" aria-labelledby="pills-people-tab">
          <PeopleSection title="People you can follow" accounts={peopleYouCanFollow} />
          <PeopleSection title="Popular" accounts={popularPeople} />
          <PeopleSection title="News Papers & Channels" accounts={newsChannels} />
          <PeopleSection title="Politicians" accounts={politicians} />
        </div>
        <div className="tab-pane fade" id="pills-trending" role="tabpanel" aria-labelledby="pills-trending-tab">
          {/* Post Tab */}
          <div className="px-3">
            <div
              className="input-group shadow-sm mb-3 rounded-4 overflow-hidden py-2 bg-glass"
              onClick={() => openModal('post')}
            >
              <span className="input-group-text material-icons border-0 bg-transparent text-primary">account_circle</span>
              <input type="text" className="form-control border-0 bg-transparent fw-light ps-1" placeholder="What's on your mind." />
              <a
                href="#"
                className="text-decoration-none input-group-text bg-transparent border-0 material-icons text-primary"
                onClick={(e) => e.preventDefault()}
              >
                add_circle
              </a>
            </div>
          </div>
          {/* Feeds */}
          <div className="feeds">
            {trendingPosts.map((post) => (
              <PostCard key={post.id} post={post} variant="compact" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
