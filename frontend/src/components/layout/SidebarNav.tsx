import { NavLink } from 'react-router-dom'
import { useMe } from '../../hooks/useMe'

const mainNavItems = [
  { to: '/', icon: 'house', label: 'Feed' },
  { to: '/market', icon: 'candlestick_chart', label: 'Markets' },
  { to: '/portfolio', icon: 'cases', label: 'Portfolio' },
  { to: '/deposit', icon: 'account_balance_wallet', label: 'Deposit' },
  { to: '/profile', icon: 'account_circle', label: 'My Profile' },
  // Create Market is creator-only — hidden from regular users entirely.
  { to: '/create', icon: 'local_fire_department', label: 'Create Market', creatorOnly: true },
]

export default function SidebarNav() {
  const { isCreator } = useMe()
  const items = mainNavItems.filter((i) => !i.creatorOnly || isCreator)
  return (
    <ul className="navbar-nav justify-content-end flex-grow-1">
      {items.map((item) => (
        <li className="nav-item" key={item.to}>
          <NavLink to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} end>
            <span className="material-icons me-3">{item.icon}</span> <span>{item.label}</span>
          </NavLink>
        </li>
      ))}
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
