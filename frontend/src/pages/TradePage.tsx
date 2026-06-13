import RightSidebar from '../components/layout/RightSidebar'
import TradeContent from '../components/trade/TradeContent'
import { barcelonaTradeMarket } from '../data/trade'

// El Clasico (FC Barcelona) trading panel
export default function TradePage() {
  return (
    <>
      <main className="col col-xl-6 col-xxl-8 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12 border-start border-end">
        <TradeContent market={barcelonaTradeMarket} />
      </main>
      <RightSidebar />
    </>
  )
}
