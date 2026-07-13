import { Link } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'
import ArcPositions from '../components/portfolio/ArcPositions'

// Portfolio — the connected wallet's real on-chain positions (buy/sell/redeem).
export default function PortfolioPage() {
  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12 border-start border-end">
        <div className="main-content">
          <div className="d-flex align-items-center pb-2 px-lg-3 pt-3">
            <Link to="/" className="material-icons text-white text-decoration-none m-none me-3">arrow_back</Link>
            <p className="ms-2 mb-0 fw-bold text-body fs-6">Portfolio</p>
          </div>
          <ArcPositions />
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
