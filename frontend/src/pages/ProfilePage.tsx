import { Link } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'
import ProfileHeader from '../components/profile/ProfileHeader'
import FollowingList from '../components/profile/FollowingList'
import ArcPositions from '../components/portfolio/ArcPositions'
import ProfileTabs from '../components/profile/ProfileTabs'
import { useUserProfile } from '../hooks/useUserProfile'
import { useWallet } from '../hooks/useWallet'
import { useUi } from '../components/layout/UiContext'

// My profile (real). Identity + markets I created + my on-chain positions.
export default function ProfilePage() {
  const { address, isLoggedIn, promptLogin } = useWallet()
  const { data, loading } = useUserProfile(address)
  const { openModal } = useUi()

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
            <>
              <ProfileHeader user={data.user} markets={data.markets} isMe />
              <ProfileTabs name={data.user.name} address={data.user.address as `0x${string}`} />
            </>
          ) : (
            <div className="bg-glass rounded-4 shadow-sm p-4 text-center m-lg-3">
              <p className="text-muted mb-3">No profile yet — set a name and bio to get started. Verifying with World ID is optional (adds the checkmark).</p>
              <div className="d-flex gap-2 justify-content-center flex-wrap">
                <Link to="/edit-profile" className="btn btn-primary rounded-4 fw-bold">Set up profile</Link>
                <button className="btn btn-outline-primary rounded-4 fw-bold" onClick={() => openModal('onboard')}>Get verified</button>
              </div>
            </div>
          )}

          {address && <FollowingList address={address} />}
          <ArcPositions />
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
