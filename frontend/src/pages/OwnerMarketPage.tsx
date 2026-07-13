import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'

// Pretty product URLs: /<founder|address>/<market_name|id|address> resolves through the
// backend (/api/resolve) to the canonical market page. /vadym/5, /vadym/0xFPMM…,
// /vadym/will-eth-close-above-1000 all land on the same market.
export default function OwnerMarketPage() {
  const { owner, market } = useParams()
  const [target, setTarget] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/resolve/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(market ?? '')}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((b) => { if (alive) setTarget(`/trade/m/${b.market.id}`) })
      .catch(() => { if (alive) setMissing(true) })
    return () => { alive = false }
  }, [owner, market])

  if (target) return <Navigate to={target} replace />
  // in-layout states (a full-page 404 inside the app grid breaks the layout)
  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-12 border-start border-end">
        {missing ? (
          <div className="main-content p-4 text-center">
            <p className="text-body fw-bold mb-1">Market not found</p>
            <p className="text-muted small mb-3">
              Nothing at “{owner}/{market}” — the market may not exist yet.
            </p>
            <Link to="/market" className="btn btn-primary rounded-4">Back to markets</Link>
          </div>
        ) : (
          <div className="main-content p-5 text-center"><div className="spinner-border" role="status" /></div>
        )}
      </main>
      <RightSidebar />
    </>
  )
}
