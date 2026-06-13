import { Link } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'
import { notifications } from '../data/notifications'
import type { NotificationItem } from '../data/notifications'

function NotificationRow({ notification }: { notification: NotificationItem }) {
  return (
    <a href="#" className="p-3 border-bottom d-flex align-items-center text-white text-decoration-none">
      <div>
        <div className="text-muted fw-light d-flex align-items-center">
          <small>{notification.handle}</small>
          <span className="mx-1 material-icons md-3">circle</span>
        </div>
        <p className="fw-bold mb-0 pe-3">{notification.message}</p>
        <small className="text-muted">{notification.category}</small>
        <br />
      </div>
    </a>
  )
}

export default function NotificationPage() {
  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content border-start border-end p-lg-3">
          <div className="d-flex align-items-center mb-3">
            <Link to="/" className="material-icons text-white text-decoration-none m-none me-3">
              arrow_back
            </Link>
            <p className="ms-2 mb-0 fw-bold text-body fs-6">Explore</p>
          </div>
          <div className="bg-glass rounded-4 overflow-hidden shadow-sm mb-4 mb-lg-0">
            {notifications.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} />
            ))}
          </div>
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
