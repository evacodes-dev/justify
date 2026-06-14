import { Link } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'
import { useMarkets } from '../hooks/useMarkets'

// Explore — real, tradeable FPMM markets on Arc (from the backend), linking to the
// per-market trade page. No mock entries.
export default function MarketPage() {
  const { markets, loading } = useMarkets()

  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content border-start border-end p-lg-3">
          <div className="d-flex align-items-center mb-3">
            <Link to="/" className="material-icons text-white text-decoration-none m-none me-3">arrow_back</Link>
            <p className="ms-2 mb-0 fw-bold text-body fs-6">Explore</p>
          </div>

          {loading ? (
            <div className="text-center py-5"><div className="spinner-border" role="status" /></div>
          ) : markets.length === 0 ? (
            <p className="text-muted text-center py-5">No markets yet — <Link to="/create">create one</Link>.</p>
          ) : (
            <div className="bg-glass rounded-4 overflow-hidden shadow-sm mb-4 mb-lg-0">
              {markets.map(({ demo, api }) => (
                <Link key={demo.id} to={`/trade/m/${demo.id}`} className="p-3 border-bottom d-flex align-items-center text-white text-decoration-none">
                  <div>
                    <div className="text-muted fw-light d-flex align-items-center">
                      <small>@{demo.author ?? 'justify'}</small>
                      <span className="mx-1 material-icons md-3">circle</span>
                      <small>{api.resolved ? 'Resolved' : 'Live'}</small>
                    </div>
                    <p className="fw-bold mb-0 pe-3">{demo.question}</p>
                    <small className="text-muted">{Math.round(api.priceYes * 100)}% YES · ${api.volume.toFixed(2)} Vol</small>
                    <br />
                    <span className="text-primary">{demo.tags}</span>
                  </div>
                  <img style={{ maxWidth: '100px' }} src={demo.thumb} className="img-fluid rounded-4 ms-auto" alt="market" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
