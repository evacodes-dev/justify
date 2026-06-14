import { Link, useParams } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'
import ProfileHeader from '../components/profile/ProfileHeader'
import { useUserProfile } from '../hooks/useUserProfile'
import { useWallet } from '../hooks/useWallet'

// Public profile of any user, by name or address (/u/:name). Real data from the backend.
export default function UserProfilePage() {
  const { name } = useParams()
  const { address } = useWallet()
  const { data, loading, error } = useUserProfile(name)
  const isMe = !!(data && address && data.user.address.toLowerCase() === address.toLowerCase())

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12 border-start border-end">
        <div className="main-content">
          <div className="d-flex align-items-center pb-2 px-lg-3 pt-3">
            <Link to="/" className="material-icons text-white text-decoration-none m-none me-3">arrow_back</Link>
            <p className="ms-2 mb-0 fw-bold text-body fs-6">{data ? `@${data.user.name}` : 'Profile'}</p>
          </div>
          {loading ? (
            <div className="text-center py-5"><div className="spinner-border" role="status" /></div>
          ) : error || !data ? (
            <p className="text-muted text-center py-5">User not found.</p>
          ) : (
            <ProfileHeader user={data.user} markets={data.markets} isMe={isMe} />
          )}
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
