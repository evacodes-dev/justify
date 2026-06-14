import { Link, useParams } from 'react-router-dom'
import TradeContent from '../components/trade/TradeContent'
import ResolutionBlock from '../components/trade/ResolutionBlock'
import RightSidebar from '../components/layout/RightSidebar'
import type { TradeMarket } from '../data/trade'
import { useMarketById } from '../hooks/useMarkets'
import { useArcMarket } from '../hooks/useArcMarket'
import { useWallet } from '../hooks/useWallet'

// A real, tradeable Arc market rendered through the existing trade-page design
// (chart + buy/sell box + comments). The buy/sell box places real on-chain bets.
export default function LiveTradePage() {
  const { id } = useParams()
  const { row, loading } = useMarketById(id)
  const demo = row?.demo
  const { address } = useWallet()
  const { state } = useArcMarket(demo?.address, address)

  if (loading && !demo) {
    return (
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-12 border-start border-end">
        <div className="main-content p-5 text-center"><div className="spinner-border" role="status" /></div>
      </main>
    )
  }

  if (!demo) {
    return (
      <>
        <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-12 border-start border-end">
          <div className="main-content p-4 text-center">
            <p className="text-body fw-bold mb-3">Market not found.</p>
            <Link to="/market" className="btn btn-primary rounded-4">Back to markets</Link>
          </div>
        </main>
        <RightSidebar />
      </>
    )
  }

  const yesPct = state?.yesPct ?? 50
  const total = state?.total ?? 0

  const market: TradeMarket = {
    id: String(demo.id),
    author: { name: demo.author ?? 'justify.eth', handle: '@justify', avatar: '/img/images.jpeg' },
    date: state?.resolved ? 'Resolved' : 'Live',
    wrapperClassName: 'd-md-flex',
    avatarClassName: 'mb-3 mb-md-0 img-fluid rounded-circle user-img',
    innerClassName: 'd-flex ms-md-3 align-items-start w-100',
    headerClassName: 'market-header',
    metaClassName: 'market-meta',
    title: demo.question,
    meta: `$${total.toFixed(2)} Vol • ${yesPct}% YES • live on Arc`,
    yesOption: `Yes ${yesPct}¢`,
    noOption: `No ${100 - yesPct}¢`,
    likes: '0',
    commentsCount: '0',
    reposts: '0',
    comments: [],
  }

  return (
    <>
      <main className="col col-xl-8 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12 border-start border-end">
        <div className="d-flex align-items-center pt-3 px-lg-3">
          <Link to="/market" className="material-icons text-white text-decoration-none m-none me-3">arrow_back</Link>
          <p className="ms-2 mb-0 fw-bold text-body fs-6">Market #{demo.id}</p>
        </div>
        <ResolutionBlock market={demo} />
        <TradeContent market={market} live={{ address: demo.address, question: demo.question }} />
      </main>
      <RightSidebar />
    </>
  )
}
