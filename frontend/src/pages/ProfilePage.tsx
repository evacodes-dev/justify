import { Link } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'
import ProfileHeader from '../components/profile/ProfileHeader'
import ArcPositions from '../components/portfolio/ArcPositions'
import { useUserProfile } from '../hooks/useUserProfile'
import { useWallet } from '../hooks/useWallet'

// My profile (real). Identity + markets I created + my on-chain positions.
export default function ProfilePage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const { data, loading } = useUserProfile(address)

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12 border-start border-end">
        <div className="main-content">
          <div className="d-flex align-items-center pb-2 px-lg-3 pt-3">
            <Link to="/" className="material-icons text-white text-decoration-none m-none me-3">arrow_back</Link>
            <p className="ms-2 mb-0 fw-bold text-body fs-6">My profile</p>
          </div>

          {!isLoggedIn ? (
            <div className="bg-glass rounded-4 shadow-sm p-4 text-center m-lg-3">
              <p className="text-muted mb-3">Connect your wallet to see your profile.</p>
              <button className="btn btn-primary rounded-4 fw-bold" onClick={promptLogin}>Sign In +</button>
            </div>
          ) : loading ? (
            <div className="text-center py-5"><div className="spinner-border" role="status" /></div>
          ) : data ? (
            <ProfileHeader user={data.user} markets={data.markets} isMe />
          ) : (
            <div className="bg-glass rounded-4 shadow-sm p-4 text-center m-lg-3">
              <p className="text-muted mb-3">No profile yet — verify with World ID to claim your name.</p>
              <Link to="/create" className="btn btn-primary rounded-4 fw-bold text-decoration-none">Get verified</Link>
            </div>
          )}

          <ArcPositions />
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
