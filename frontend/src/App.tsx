import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { UiProvider } from './components/layout/UiContext'
import AppLayout from './components/layout/AppLayout'
import FeedPage from './pages/FeedPage'
import MarketPage from './pages/MarketPage'
import TradePage from './pages/TradePage'
import TradeFounderPage from './pages/TradeFounderPage'
import LiveTradePage from './pages/LiveTradePage'
import AgentsPage from './pages/AgentsPage'
import AgentProfilePage from './pages/AgentProfilePage'
import LeaderboardPage from './pages/LeaderboardPage'
import DepositPage from './pages/DepositPage'
import PortfolioPage from './pages/PortfolioPage'
import ProfilePage from './pages/ProfilePage'
import EditProfilePage from './pages/EditProfilePage'
import CreatePage from './pages/CreatePage'
import NotificationPage from './pages/NotificationPage'
import HelpPage from './pages/HelpPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <BrowserRouter>
      <UiProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<FeedPage />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/trade" element={<TradePage />} />
            <Route path="/trade-founder" element={<TradeFounderPage />} />
            <Route path="/trade/m/:id" element={<LiveTradePage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/agents/:name" element={<AgentProfilePage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/deposit" element={<DepositPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/edit-profile" element={<EditProfilePage />} />
            <Route path="/create" element={<CreatePage />} />
            <Route path="/notification" element={<NotificationPage />} />
            <Route path="/help" element={<HelpPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </UiProvider>
    </BrowserRouter>
  )
}
