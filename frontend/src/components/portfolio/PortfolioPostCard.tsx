import Dropdown from 'react-bootstrap/Dropdown'
import { Link } from 'react-router-dom'
import VerifiedBadge from '../common/VerifiedBadge'
import ChanceArc from '../market/ChanceArc'
import type { PortfolioPost, PortfolioToken } from '../../data/portfolio'

function PostMenu() {
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

function TokenItem({ token }: { token: PortfolioToken }) {
  return (
    <div className="token-item">
      <div className="token-header">
        <span className="token-name">{token.name}</span>
        <span className={`token-pnl ${token.pnlClass}`}>{token.pnl}</span>
      </div>
      <div className="token-info">
        <span>Amount:</span>
        <span>{token.amount}</span>
      </div>
      <div className="token-info">
        <span>Current Price:</span>
        <span>{token.currentPrice}</span>
      </div>
      <div className="token-info total">
        <span>Total Value:</span>
        <span>{token.totalValue}</span>
      </div>
    </div>
  )
}

// Feed post with a market card showing the user's open position ("Your Position")
export default function PortfolioPostCard({ post }: { post: PortfolioPost }) {
  const { author, market } = post
  return (
    <div className="border-bottom py-3 px-lg-3">
      <div className="bg-glass p-3 feed-item rounded-4 shadow-sm">
        <div className="d-md-flex">
          <img
            src={author.avatar}
            className="img-fluid rounded-circle user-img mb-3 mb-md-0"
            alt="profile-img"
            style={post.squareAvatar ? { borderRadius: '0px' } : undefined}
          />
          <div className="d-flex ms-md-3 align-items-start w-100">
            <div className="w-100">
              <div className="d-flex align-items-center justify-content-between">
                <Link to="/profile" className="text-decoration-none d-flex align-items-center">
                  <h6 className="fw-bold mb-0 text-body">{author.name}</h6>
                  {author.verified && <VerifiedBadge />}
                  <small className="text-muted ms-2">{author.handle}</small>
                </Link>
                <div className="d-flex align-items-center small">
                  <p className="text-muted mb-0">{post.date}</p>
                  <PostMenu />
                </div>
              </div>
              <div className="my-2">
                <p className="text-white market-header" dangerouslySetInnerHTML={{ __html: post.titleHtml }} />
                <ul className="list-unstyled mb-3">
                  <li></li>
                  <li></li>
                </ul>
                <p></p>
                {/* Justify Market Card Component */}
                <div className="market-container">
                  <div className="market-card" style={{ height: '100%' }}>
                    <div className="market-inner">
                      <div className="market-front" style={{ position: 'relative' }}>
                        <div className="market-header">
                          <img
                            src={market.thumb}
                            alt="Market Thumbnail"
                            className="market-thumb"
                            style={market.thumbHeight ? { height: market.thumbHeight } : undefined}
                          />
                          <div className="market-info">
                            <div className="market-title">
                              <Link to={market.link}>{market.title}</Link>
                            </div>
                            <div className="market-description">{market.description}</div>
                            <div className="market-meta">
                              <span className="market-volume">{market.volume}</span>
                              <span className="market-time">{market.endTime}</span>
                            </div>
                          </div>
                          <div className="market-chance">
                            <ChanceArc chance={market.chance} />
                          </div>
                        </div>
                        {/* Portfolio Block */}
                        <div className="portfolio-block">
                          <h3>Your Position</h3>
                          <div className="token-portfolio">
                            {post.tokens.map((token) => (
                              <TokenItem key={token.name} token={token} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="market-back"></div>
                    </div>
                    {post.hasTradeBox && <div className="trade-box"></div>}
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
