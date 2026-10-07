import { NavLink } from 'react-router-dom'
import { HistoryIcon, HomeIcon, ProfileIcon, VehiclesIcon } from './icons'

// Icon boxes keep each glyph's Figma proportions at 25px tall.
//
// `viewTransition` opts each tab change into the browser's View Transitions
// API, which cross-fades the old screen into the new one at the compositor
// level — smoother than anything JavaScript can do, and free on browsers
// that support it. Browsers that don't simply navigate as before.
const TABS = [
  { to: '/', label: 'Home', Icon: HomeIcon, width: 23, end: true },
  { to: '/history', label: 'History', Icon: HistoryIcon, width: 23.7 },
  { to: '/vehicles', label: 'Vehicles', Icon: VehiclesIcon, width: 28 },
  { to: '/profile', label: 'Profile', Icon: ProfileIcon, width: 25 },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map(({ to, label, Icon, width, end }) => (
        <NavLink key={to} to={to} end={end} viewTransition className="bottom-nav__item">
          <Icon className="bottom-nav__icon" width={width} height={25} />
          <span className="bottom-nav__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
