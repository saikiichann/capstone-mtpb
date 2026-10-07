import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'

// Layout for the four main tabs (Home, History, Vehicles, Profile).
// Screens outside the tabs (QR violation details, payment, FAQ, auth)
// render without the bottom nav, as in the Figma file.
export default function AppLayout() {
  return (
    <>
      <div className="app-content">
        <Outlet />
      </div>
      <BottomNav />
    </>
  )
}
