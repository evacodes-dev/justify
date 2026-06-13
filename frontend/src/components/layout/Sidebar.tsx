import Offcanvas from 'react-bootstrap/Offcanvas'
import { Link } from 'react-router-dom'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import SidebarNav, { SidebarSecondaryNav } from './SidebarNav'
import { useUi } from './UiContext'
import { useWideLayout } from './wideLayout'
import { useWallet } from '../../hooks/useWallet'
import { useUsdcBalance } from '../../hooks/useUsdcBalance'

const shortAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

// Logged out: opens Dynamic's auth modal (Google / email / wallet).
// Logged in: shows the connected address + live USDC balance on Arc; click
// opens Dynamic's profile modal (account details + log out).
function SignInButton() {
  const { primaryWallet, setShowAuthFlow, setShowDynamicUserProfile } = useDynamicContext()
  const { address } = useWallet()
  const { balance } = useUsdcBalance(address)
  const className = 'btn btn-primary w-100 text-decoration-none rounded-4 py-3 fw-bold text-uppercase m-0'

  if (primaryWallet) {
    return (
      <button type="button" className={`${className} d-flex flex-column align-items-center gap-1`} onClick={() => setShowDynamicUserProfile(true)}>
        <span>{shortAddress(primaryWallet.address)}</span>
        <span className="badge bg-light-glass text-body fw-normal text-lowercase">
          {balance == null ? '… USDC' : `$${balance.toFixed(2)} USDC · Arc`}
        </span>
      </button>
    )
  }

  return (
    <button type="button" className={className} onClick={() => setShowAuthFlow(true)}>
      Sign In +
    </button>
  )
}

// Left column: mobile offcanvas menu + fixed desktop sidebar
export default function Sidebar() {
  const { offcanvasOpen, setOffcanvasOpen } = useUi()
  // Trade pages narrow the side columns to col-xxl-2 so the col-xxl-8 main
  // column still fits 12 grid columns at the xxl breakpoint.
  const wide = useWideLayout()
  return (
    <aside className={`col col-xl-3${wide ? ' col-xxl-2' : ''} order-xl-1 col-lg-12 order-lg-2 col-12`}>
      <Offcanvas
        show={offcanvasOpen}
        onHide={() => setOffcanvasOpen(false)}
        placement="start"
        className="p-2 bg-brown-gradient"
      >
        <div className="sidebar-nav mb-3">
          <div className="pb-4">
            <Link to="/" className="text-decoration-none" onClick={() => setOffcanvasOpen(false)}>
              <img src="/img/logo.png" className="img-fluid logo" alt="brand-logo" />
            </Link>
          </div>
          <SidebarNav />
        </div>
        <SignInButton />
      </Offcanvas>
      {/* Sidebar */}
      <div className="ps-0 m-none fix-sidebar py-3 pe-3">
        <div className="sidebar-nav mb-3">
          <div className="pb-4 mb-4">
            <Link
              to="/"
              className="text-decoration-none"
              style={{ color: '#ececec', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, fontSize: 30 }}
            >
              JUSTIFY
            </Link>
          </div>
          <SidebarNav />
        </div>
        <div className="sidebar-nav mb-3" style={{ paddingTop: 20 }}>
          <p style={{ marginLeft: 20, marginBottom: 0, color: '#6c757d' }}>- &nbsp; - &nbsp; - &nbsp; - &nbsp; -</p>
          <SidebarSecondaryNav />
          <SignInButton />
        </div>
      </div>
    </aside>
  )
}
