import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import { isActiveVehicle, vehiclePhoto, vehicleTypeLine, verificationOf } from '../../firebase/vehicles'
import useVehicles from '../../hooks/useVehicles'

// Figma "MY VEHICLES DASHBOARD". It's also the Vehicles tab, so it keeps the
// bottom bar and has no back arrow (the design shows one).
export default function MyVehicles() {
  const { user } = useAuth()
  const { status, vehicles } = useVehicles(user?.uid)
  const hasPending = vehicles.some((v) => !isActiveVehicle(v))

  return (
    <div className="page">
      <PageHeader title="My Vehicles" />

      <main className="page__body vehicles-body">
        <p className="vehicles-body__intro">All vehicles registered under your account</p>

        {status === 'loading' && (
          <p className="empty-text" role="status">
            Loading your vehicles…
          </p>
        )}
        {status === 'error' && (
          <p className="empty-text" role="alert">
            We couldn’t load your vehicles. Check your connection and try again.
          </p>
        )}
        {status === 'ready' && vehicles.length === 0 && (
          <div className="vehicles-empty">
            <p className="vehicles-empty__title">No vehicles yet</p>
            <p>
              A vehicle is added to your account automatically when a violation is recorded under its plate number.
            </p>
          </div>
        )}

        {vehicles.length > 0 && (
          <ul className="vehicle-list">
            {vehicles.map((v) => (
              <li key={v.id}>
                <VehicleListCard vehicle={v} />
              </li>
            ))}
          </ul>
        )}

        {hasPending && (
          <p className="info-note">
            Violations only show for <strong>active</strong> vehicles. MTPB is still verifying the others. Tap a
            vehicle to see its details.
          </p>
        )}
      </main>
    </div>
  )
}

function VehicleListCard({ vehicle }) {
  const photo = vehiclePhoto(vehicle)
  const badge = verificationOf(vehicle)

  return (
    <Link
      to={`/vehicles/${encodeURIComponent(vehicle.id)}`}
      className="card vehicle-row"
      aria-label={`${vehicle.plateNumber}, ${vehicleTypeLine(vehicle)}, ${badge}. View details`}
    >
      <span className={`vehicle-row__photo${photo.isStock ? ' vehicle-row__photo--stock' : ''}`}>
        <img src={photo.src} width={96} height={96} alt="" />
      </span>
      <span className="vehicle-row__text">
        <span className="vehicle-row__plate">{vehicle.plateNumber}</span>
        <span className="vehicle-row__type">{vehicleTypeLine(vehicle)}</span>
        <span className="vehicle-row__footer">
          <span className="vehicle-row__color">{vehicle.color}</span>
          <StatusBadge status={badge} className="vehicle-row__badge" />
        </span>
      </span>
      <span className="vehicle-row__chevron" aria-hidden="true">
        &gt;
      </span>
    </Link>
  )
}
