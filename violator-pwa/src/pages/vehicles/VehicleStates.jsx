import { Link } from 'react-router-dom'

// Loading / not found / error cards for the vehicle pages.
export default function VehicleStates({ status }) {
  if (status === 'loading') {
    return (
      <div className="card state-card" role="status">
        <p>Loading vehicle…</p>
      </div>
    )
  }
  if (status === 'not-found') {
    return (
      <div className="card state-card">
        <h2 className="screen-title">Vehicle not found</h2>
        <p>This vehicle isn’t registered on your account. It may have been removed.</p>
        <Link className="text-link" to="/vehicles">
          Back to My Vehicles
        </Link>
      </div>
    )
  }
  return (
    <div className="card state-card" role="alert">
      <h2 className="screen-title">Something went wrong</h2>
      <p>We couldn’t load this vehicle. Check your connection and try again.</p>
    </div>
  )
}
