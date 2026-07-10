import { Outlet } from 'react-router-dom'
import MobileHeader from './MobileHeader'
import Sidebar from './Sidebar'
import Footer from './Footer'
import PostModal from '../modals/PostModal'
import LanguageModal from '../modals/LanguageModal'
import CommentModal from '../modals/CommentModal'
import TradeModal from '../modals/TradeModal'
import OnboardingModal from '../modals/OnboardingModal'
import { useWideLayout } from './wideLayout'
import { useAutoDotation } from '../../hooks/useAutoDotation'

// Three-column shell shared by every page; pages render <main> + optional
// right sidebar through the router outlet.
export default function AppLayout() {
  // Trade pages use the wider `container-fluid page-container` (80% fluid)
  // wrapper; every other page keeps the standard fixed-width `.container`.
  const wide = useWideLayout()
  // Auto-fund a freshly-connected embedded wallet (best-effort, needs backend).
  useAutoDotation()
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
      <LanguageModal />
      <CommentModal />
      <TradeModal />
      <OnboardingModal />
    </>
  )
}
