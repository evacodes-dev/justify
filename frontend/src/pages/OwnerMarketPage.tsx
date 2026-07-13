import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import NotFoundPage from './NotFoundPage'

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

  if (missing) return <NotFoundPage />
  if (target) return <Navigate to={target} replace />
  return (
    <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-12 border-start border-end">
      <div className="main-content p-5 text-center"><div className="spinner-border" role="status" /></div>
    </main>
  )
}
