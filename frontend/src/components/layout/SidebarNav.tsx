import { NavLink } from 'react-router-dom'
import OverlayTrigger from 'react-bootstrap/OverlayTrigger'
import Tooltip from 'react-bootstrap/Tooltip'
import { useMe } from '../../hooks/useMe'
import { useUi } from './UiContext'

const mainNavItems = [
  { to: '/', icon: 'house', label: 'Feed' },
  { to: '/market', icon: 'candlestick_chart', label: 'Markets' },
  { to: '/leaderboard', icon: 'leaderboard', label: 'Leaderboard' },
  { to: '/proof', icon: 'verified', label: 'Proof' },
  { to: '/portfolio', icon: 'cases', label: 'Portfolio' },
  { to: '/deposit', icon: 'account_balance_wallet', label: 'Deposit' },
  { to: '/profile', icon: 'account_circle', label: 'My Profile' },
]

export default function SidebarNav() {
  const { isCreator, isHumanVerified, isIdentityVerified } = useMe()
  const { openModal } = useUi()

  // Create Market unlocks after BOTH World ID steps (humanity + identity). The creator role
  // stays an admin grant — shown as the last line once the verifications are done.
  const verificationsDone = isHumanVerified && isIdentityVerified
  const canCreate = verificationsDone && isCreator

  const check = (ok: boolean) => (ok ? '✓' : '○')
  const createTooltip = (
    <Tooltip id="create-market-locked">
      <div className="text-start">
        <div className="fw-bold mb-1">To create markets:</div>
        <div>{check(isHumanVerified)} 1. Verify you're human (World ID)</div>
        <div>{check(isIdentityVerified)} 2. Pass the identity check</div>
        {verificationsDone && !isCreator && <div>{check(false)} 3. Creator role (granted by admins)</div>}
        <div className="text-muted mt-1">Click to start verification</div>
      </div>
    </Tooltip>
  )

  return (
    <ul className="navbar-nav justify-content-end flex-grow-1">
      {mainNavItems.map((item) => (
        <li className="nav-item" key={item.to}>
          <NavLink to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} end>
            <span className="material-icons me-3">{item.icon}</span> <span>{item.label}</span>
          </NavLink>
        </li>
      ))}
      <li className="nav-item">
        {canCreate ? (
          <NavLink to="/create" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} end>
            <span className="material-icons me-3">local_fire_department</span> <span>Create Market</span>
          </NavLink>
        ) : (
          <OverlayTrigger placement="right" overlay={createTooltip}>
            <a
              href="#"
              className="nav-link"
              style={{ opacity: 0.45, cursor: 'not-allowed' }}
              aria-disabled="true"
              onClick={(e) => {
                e.preventDefault()
                // The tooltip says what's missing; the click takes them straight there.
                if (!verificationsDone) openModal('onboard')
              }}
            >
              <span className="material-icons me-3">local_fire_department</span> <span>Create Market</span>
              <span className="material-icons ms-2" style={{ fontSize: 16 }}>lock</span>
            </a>
          </OverlayTrigger>
        )}
      </li>
    </ul>
  )
}

export function SidebarSecondaryNav() {
  return (
    <ul className="navbar-nav justify-content-end flex-grow-1">
      <li className="nav-item">
        <NavLink to="/edit-profile" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span className="material-icons me-3">settings</span> <span>Settings</span>
        </NavLink>
      </li>
      <li className="nav-item">
        <NavLink to="/help" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span className="material-icons me-3">help</span> <span>Help Center</span>
        </NavLink>
      </li>
    </ul>
  )
}