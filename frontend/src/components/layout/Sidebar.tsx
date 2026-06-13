import Offcanvas from 'react-bootstrap/Offcanvas'
import { Link } from 'react-router-dom'
import SidebarNav, { SidebarSecondaryNav } from './SidebarNav'
import { useUi } from './UiContext'
import { useWideLayout } from './wideLayout'

function SignInButton() {
  const { openModal } = useUi()
  return (
    <a
      href="#"
      className="btn btn-primary w-100 text-decoration-none rounded-4 py-3 fw-bold text-uppercase m-0"
      onClick={(e) => {
        e.preventDefault()
        openModal('sign')
      }}
    >
      Sign In +
    </a>
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
