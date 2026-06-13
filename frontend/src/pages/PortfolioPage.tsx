import { Link } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'
import FollowButton from '../components/common/FollowButton'
import VerifiedBadge from '../components/common/VerifiedBadge'
import PortfolioPostCard from '../components/portfolio/PortfolioPostCard'
import { followerAvatars, followingAvatars, portfolioPosts } from '../data/portfolio'

// Profile summary card at the top of the Portfolio page
function ProfileCard() {
  return (
    <div className="border-bottom py-3 px-lg-3">
      <div className="bg-glass rounded-4 shadow-sm profile">
        <div className="d-flex align-items-center px-3 pt-3">
          <img src="/img/images.jpeg" className="img-fluid rounded-circle" alt="profile-img" />
          <div className="ms-3">
            <h6 className="mb-0 d-flex align-items-start text-body fs-6 fw-bold">
              founder
              <VerifiedBadge />
            </h6>
            <p className="text-muted mb-0">@founder</p>
          </div>
          <div className="ms-auto">
            <FollowButton />
          </div>
        </div>
        <div className="p-3">
          <p className="mb-2 fs-6">
            Founder of Justify — the Social Prediction Platform on Base Building the future of onchain opinion
            markets. Web3 believer. Product thinker. Social Trading
          </p>
          <p className="d-flex align-items-center mb-3">
            <span className="material-icons me-2 rotate-320 text-muted md-16">link</span>
            <Link to="/profile" className="text-decoration-none text-primary">justify.market/founder</Link>
            <span className="material-icons me-2 text-muted md-16 ms-4">calendar_today</span>
            <span>Joined on Feb 2023</span>
          </p>
          <div className="d-flex followers">
            <div>
              <p className="mb-0">
                391k <span className="text-muted">Followers</span>
              </p>
              <div className="d-flex">
                {followerAvatars.map((src) => (
                  <img key={src} src={src} className="img-fluid rounded-circle" alt="follower-img" />
                ))}
              </div>
            </div>
            <div className="ms-5 ps-5">
              <p className="mb-0">
                3 <span className="text-muted">Following</span>
              </p>
              <div className="d-flex">
                {followingAvatars.map((src) => (
                  <img key={src} src={src} className="img-fluid rounded-circle" alt="follower-img" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12 border-start border-end">
        <div className="main-content">
          <div className="d-flex align-items-center pb-2 px-lg-3">
            <div className="d-flex align-items-center">
              <Link to="/" className="material-icons text-white text-decoration-none m-none me-3">arrow_back</Link>
              <p className="ms-2 mb-0 fw-bold text-body fs-6">Shay Jordon</p>
            </div>
            <a href="#" className="text-decoration-none material-icons md-20 ms-auto text-muted">share</a>
          </div>
          <ProfileCard />
          <div className="tab-content" id="pills-tabContent">
            <div className="tab-pane fade show active" id="pills-feed" role="tabpanel" aria-labelledby="pills-feed-tab">
              {/* Follow People */}
              <div className="ms-1">
                {/* Feeds */}
                <div className="feeds">
                  {portfolioPosts.map((post) => (
                    <PortfolioPostCard key={post.id} post={post} />
                  ))}
                </div>
              </div>
            </div>
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
