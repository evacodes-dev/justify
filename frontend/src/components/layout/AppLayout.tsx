import { Outlet } from 'react-router-dom'
import MobileHeader from './MobileHeader'
import Sidebar from './Sidebar'
import Footer from './Footer'
import PostModal from '../modals/PostModal'
import SignInModal from '../modals/SignInModal'
import LanguageModal from '../modals/LanguageModal'
import CommentModal from '../modals/CommentModal'
import { useWideLayout } from './wideLayout'

// Three-column shell shared by every page; pages render <main> + optional
// right sidebar through the router outlet.
export default function AppLayout() {
  // Trade pages use the wider `container-fluid page-container` (80% fluid)
  // wrapper; every other page keeps the standard fixed-width `.container`.
  const wide = useWideLayout()
  return (
    <>
      <MobileHeader />
      <div className="py-4">
        <div className={wide ? 'container-fluid page-container' : 'container'}>
          <div className="row position-relative g-0">
            <Outlet />
            <Sidebar />
          </div>
        </div>
      </div>
      <Footer />
      <PostModal />
      <SignInModal />
      <LanguageModal />
      <CommentModal />
    </>
  )
}
