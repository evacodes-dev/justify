import RightSidebar from '../components/layout/RightSidebar'
import TradeContent from '../components/trade/TradeContent'
import { founderTradeMarket } from '../data/trade'

// Ukraine x Russia ceasefire trading panel
export default function TradeFounderPage() {
  return (
    <>
      <main className="col col-xl-6 col-xxl-8 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12 border-start border-end">
        <TradeContent market={founderTradeMarket} />
      </main>
      <RightSidebar />
    </>
  )
}
