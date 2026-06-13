import { NavLink } from 'react-router-dom'

const mainNavItems = [
  { to: '/', icon: 'house', label: 'Feed' },
  { to: '/market', icon: 'candlestick_chart', label: 'Markets' },
  { to: '/portfolio', icon: 'cases', label: 'Portfolio' },
  { to: '/notification', icon: 'notification_add', label: 'Notifications' },
  { to: '/profile', icon: 'account_circle', label: 'My Profile' },
  { to: '/create', icon: 'local_fire_department', label: 'Create Market' },
]

export default function SidebarNav() {
  return (
    <ul className="navbar-nav justify-content-end flex-grow-1">
      {mainNavItems.map((item) => (
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
