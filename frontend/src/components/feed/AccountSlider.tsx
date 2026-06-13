import Slider from 'react-slick'
import { Link } from 'react-router-dom'
import type { Account } from '../../types'
import FollowButton from '../common/FollowButton'

// Slider breakpoints
const sliderSettings = {
  dots: false,
  arrows: false,
  infinite: false,
  speed: 300,
  slidesToShow: 4.2,
  slidesToScroll: 4,
  responsive: [
    { breakpoint: 1024, settings: { slidesToShow: 4.5, slidesToScroll: 4 } },
    { breakpoint: 680, settings: { slidesToShow: 2.5, slidesToScroll: 2 } },
    { breakpoint: 520, settings: { slidesToShow: 3.5, slidesToScroll: 3 } },
    { breakpoint: 422, settings: { slidesToShow: 2.5, slidesToScroll: 2 } },
  ],
}

// Horizontal "Follow Creators" slider
export default function AccountSlider({ accounts }: { accounts: Account[] }) {
  return (
    <Slider {...sliderSettings} className="account-slider border-bottom px-lg-3 pb-3">
      {accounts.map((account) => (
        <div className="account-item" key={account.id}>
          <div className="me-2 bg-glass shadow-sm rounded-4 p-3 user-list-item d-flex justify-content-center my-2">
            <div className="text-center">
              <div className="position-relative d-flex justify-content-center">
                <Link to="/profile" className="text-decoration-none">
                  <img src={account.avatar} className="img-fluid rounded-circle mb-3" alt="profile-img" />
                  <div className="position-absolute">
                    <span className="material-icons bg-primary small p-1 fw-bold text-white rounded-circle">done</span>
                  </div>
                </Link>
              </div>
              <p className="fw-bold text-white m-0">{account.name}</p>
              <p className="small text-muted">{account.bio}</p>
              <FollowButton initialFollowing={account.following} />
            </div>
          </div>
        </div>
      ))}
    </Slider>
  )
}
