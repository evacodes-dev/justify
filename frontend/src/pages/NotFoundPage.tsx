import { Link } from 'react-router-dom'

// Standalone 404 page rendered outside AppLayout (no sidebars, footer or modals).
export default function NotFoundPage() {
  return (
    <>
      <div className="theme-switch-wrapper ms-3">
        <label className="theme-switch" htmlFor="checkbox">
          <input type="checkbox" id="checkbox" />
          <span className="slider round"></span>
          <i className="icofont-ui-brightness"></i>
        </label>
        <em>Enable Dark Mode!</em>
      </div>
      {/* Content */}
      <div className="p-5 text-center">
        <img src="/img/404.svg" className="img-fluid col-md-4" alt="osahan" />
        <div className="text-center pb-5">
          <h2 className="fw-bold text-white mt-4">Oh no! Where did you go?</h2>
          <p className="mb-4">We can’t seem to find the page you were looking for.</p>
          <Link to="/" className="btn btn-primary rounded-pill py-3 px-4 shadow-sm">
            <span className="px-3">Go back to safety</span>
          </Link>
        </div>
      </div>
    </>
  )
}
