import Dropdown from 'react-bootstrap/Dropdown'
import { Link } from 'react-router-dom'
import type { TradeMarket } from '../../data/trade'
import { useUi } from '../layout/UiContext'
import CommentItem from '../feed/CommentItem'
import MarketChart from './MarketChart'
import TradeBox, { type LiveTrade } from './TradeBox'

// Sets an inline style with !important priority (React's style prop drops
// !important, but this relies on it to beat Bootstrap utilities).
function importantStyle(prop: string, value: string) {
  return (el: HTMLElement | null) => {
    el?.style.setProperty(prop, value, 'important')
  }
}

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
        <Dropdown.Item className="text-dark" href="#">
          <span className="material-icons md-13 me-1">edit</span>Edit
        </Dropdown.Item>
        <Dropdown.Item className="text-dark" href="#">
          <span className="material-icons md-13 me-1">delete</span>Delete
        </Dropdown.Item>
        <Dropdown.Item className="text-dark" href="#">
          <span className="material-icons md-13 me-1 ltsp-n5">arrow_back_ios arrow_forward_ios</span>Embed Vogel
        </Dropdown.Item>
        <Dropdown.Item className="text-dark d-flex align-items-center" href="#">
          <span className="material-icons md-13 me-1">share</span>Share via another apps
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}

// The trading-panel feed item shared by /trade and /trade-founder:
// author header, market title, price chart, buy/sell box, action counters and comments.
export default function TradeFeedItem({ market, live }: { market: TradeMarket; live?: LiveTrade }) {
  const { openModal } = useUi()
  const { author } = market

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
                <Link to="/profile" className="text-decoration-none d-flex align-items-center">
                  <h6 className="fw-bold mb-0 text-body">{author.name}</h6>
                  <span className="ms-2 material-icons bg-primary p-0 md-16 fw-bold text-white rounded-circle ov-icon">done</span>
                  <small className="text-muted ms-2">{author.handle}</small>
                </Link>
                <div className="d-flex align-items-center small">
                  <p className="text-muted mb-0">{market.date}</p>
                  <TradeFeedMenu />
                </div>
              </div>
              <div className="my-2">
                <p className="text-white market-header"></p>
                <ul className="list-unstyled mb-3">
                  <li></li>
                  <li></li>
                </ul>
                <p></p>
                {/* Justify Market Card Component */}
                <div className="market-container">
                  <div className="market-container">
                    <div className={market.headerClassName}>
                      <h2>{market.title}</h2>
                      <p className={market.metaClassName}>{market.meta}</p>
                    </div>
                    <MarketChart />
                    <TradeBox yesOption={market.yesOption} noOption={market.noOption} live={live} />
                  </div>
                  <div
                    className="d-flex align-items-center justify-content-between mb-2"
                    ref={importantStyle('margin-bottom', '15px')}
                  >
                    <div>
                      <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light">
                        <span className="material-icons md-20 me-2">thumb_up_off_alt</span>
                        <span>{market.likes}</span>
                      </a>
                    </div>
                    <div>
                      <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light">
                        <span className="material-icons md-20 me-2">chat_bubble_outline</span>
                        <span>{market.commentsCount}</span>
                      </a>
                    </div>
                    <div>
                      <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light">
                        <span className="material-icons md-20 me-2">repeat</span>
                        <span>{market.reposts}</span>
                      </a>
                    </div>
                    <div>
                      <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light">
                        <span className="material-icons md-18 me-2">share</span>
                        <span>Share</span>
                      </a>
                    </div>
                  </div>
                  <div className="d-flex align-items-center mb-3" onClick={() => openModal('comment')}>
                    <span className="material-icons bg-transparent border-0 text-primary pe-2 md-36">account_circle</span>
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-3 fw-light bg-glass form-control-text"
                      placeholder="Write Your comment"
                    />
                  </div>
                  <div className="comments">
                    {market.comments.map((comment) => (
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
