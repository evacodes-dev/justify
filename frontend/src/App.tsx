import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { UiProvider } from './components/layout/UiContext'
import { ensureConfig } from './lib/markets'
import AppLayout from './components/layout/AppLayout'
import SignInScreen from './components/auth/SignInScreen'
import FeedPage from './pages/FeedPage'
import MarketPage from './pages/MarketPage'
import TradePage from './pages/TradePage'
import TradeFounderPage from './pages/TradeFounderPage'
import LiveTradePage from './pages/LiveTradePage'
import DepositPage from './pages/DepositPage'
import PortfolioPage from './pages/PortfolioPage'
import ProfilePage from './pages/ProfilePage'
import UserProfilePage from './pages/UserProfilePage'
import EditProfilePage from './pages/EditProfilePage'
import CreatePage from './pages/CreatePage'
import AdminPage from './pages/AdminPage'
import HelpPage from './pages/HelpPage'
import LeaderboardPage from './pages/LeaderboardPage'
import NotFoundPage from './pages/NotFoundPage'
import OwnerMarketPage from './pages/OwnerMarketPage'

// Warm up the chain config so trade paths have the deployed addresses ready.
void ensureConfig()

// Hard auth gate: while logged out, the sign-in screen is the ONLY thing on screen
// (no sidebar / feed / app chrome). Once Dynamic reports a session, the real app renders.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { sdkHasLoaded, primaryWallet } = useDynamicContext()
  if (!sdkHasLoaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0b0b' }}>
        <div className="spinner-border text-light" role="status" />
      </div>
    )
  }
  if (!primaryWallet) return <SignInScreen />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <UiProvider>
        <AuthGate>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<FeedPage />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/trade" element={<TradePage />} />
            <Route path="/trade-founder" element={<TradeFounderPage />} />
            <Route path="/trade/m/:id" element={<LiveTradePage />} />
            <Route path="/deposit" element={<DepositPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/u/:name" element={<UserProfilePage />} />
            <Route path="/edit-profile" element={<EditProfilePage />} />
            <Route path="/create" element={<CreatePage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            {/* hidden — reachable by URL only, no nav entry */}
            <Route path="/admin" element={<AdminPage />} />
            {/* pretty product URLs: /<founder> and /<founder>/<market>.
                Static routes above always outrank these dynamic ones. */}
            <Route path="/:name" element={<UserProfilePage />} />
            <Route path="/:owner/:market" element={<OwnerMarketPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </AuthGate>
      </UiProvider>
    </BrowserRouter>
  )
}
