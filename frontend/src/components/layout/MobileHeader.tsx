import { Link } from 'react-router-dom'
import { useUi } from './UiContext'

export default function MobileHeader() {
  const { setOffcanvasOpen } = useUi()
  return (
    <div className="web-none d-flex align-items-center px-3 pt-3 shadow-sm">
      <Link to="/" className="text-decoration-none">
        <img src="/img/logo.png" className="img-fluid logo-mobile" alt="brand-logo" />
      </Link>
      <button className="ms-auto btn btn-primary ln-0" type="button" onClick={() => setOffcanvasOpen(true)}>
        <span className="material-icons">menu</span>
      </button>
    </div>
  )
}
