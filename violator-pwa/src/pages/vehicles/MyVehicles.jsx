import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import { isActiveVehicle, isFromPayment, vehicleBadge, vehiclePhoto, vehicleTypeLine } from '../../firebase/vehicles'
import useMyViolations from '../../hooks/useMyViolations'
import usePayments from '../../hooks/usePayments'
import useVehicles from '../../hooks/useVehicles'
import { formatPeso, toMillis } from '../../utils/format'
import { samePlate } from '../../utils/plates'

// Figma "MY VEHICLES DASHBOARD". It's also the Vehicles tab, so it keeps the
// bottom bar and has no back arrow (the design shows one).
//
// Each vehicle shows its latest activity under it (Marco's option F,
// vehicle-card-options.html): the newest unpaid violation with a Pay chip,
// or the newest payment, from this account's own records on that plate.
export default function MyVehicles() {
  const { user } = useAuth()
  const { status, vehicles } = useVehicles(user?.uid)
  const { violations } = useMyViolations(user?.uid)
  const { payments } = usePayments(user?.uid)
  const hasPending = vehicles.some((v) => !isActiveVehicle(v) && !isFromPayment(v))

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
                <VehicleListCard vehicle={v} latest={latestFor(v.plateNumber, violations, payments)} />
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

const shortDate = (value) =>
  value
    ? new Date(toMillis(value)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
    : ''

// The newest thing on this plate: an unpaid violation, or a payment.
function latestFor(plate, violations, payments) {
  const items = [
    ...violations
      .filter((v) => v.paymentStatus !== 'paid' && samePlate(v.plateNumber, plate))
      .map((v) => ({
        key: `v-${v.id}`,
        at: toMillis(v.clampedAt),
        title: v.cin,
        line: [`Clamped ${shortDate(v.clampedAt)}`, v.location].filter(Boolean).join(' · '),
        chip: `Pay ${formatPeso(v.fineAmount)}`,
        tone: 'due',
        to: `/v/${encodeURIComponent(v.id ?? v.cin)}`,
      })),
    ...payments
      .filter((p) => p.isPaid && samePlate(p.plateNumber, plate))
      .map((p) => ({
        key: `p-${p.referenceNumber}`,
        at: toMillis(p.paidAt ?? p.createdAt),
        title: p.referenceNumber,
        line: [`Paid ${shortDate(p.paidAt ?? p.createdAt)}`, p.method].filter(Boolean).join(' · '),
        chip: p.awaitingVerification ? 'Verifying' : 'Paid',
        tone: p.awaitingVerification ? 'wait' : 'ok',
        to: `/receipts/${encodeURIComponent(p.referenceNumber)}`,
        state: { from: '/vehicles' },
      })),
  ]
  return items.sort((a, b) => b.at - a.at)[0] ?? null
}

function VehicleListCard({ vehicle, latest }) {
  const photo = vehiclePhoto(vehicle)
  const badge = vehicleBadge(vehicle)

  return (
    <div className="card vehicle-entry">
      <Link
        to={`/vehicles/${encodeURIComponent(vehicle.id)}`}
        className="vehicle-row"
        aria-label={`${[vehicle.plateNumber, vehicleTypeLine(vehicle), badge].filter(Boolean).join(', ')}. View details`}
      >
        <span
          className={`vehicle-row__photo${photo.isStock ? ' vehicle-row__photo--stock' : ''}${photo.isTypePhoto ? ' vehicle-row__photo--type' : ''}`}
        >
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
      {latest && (
        <Link className="vehicle-latest" to={latest.to} state={latest.state}>
          <span className="vehicle-latest__text">
            <span className="vehicle-latest__title">{latest.title}</span>
            <span className="vehicle-latest__line">{latest.line}</span>
          </span>
          <span className={`vehicle-latest__chip vehicle-latest__chip--${latest.tone}`}>{latest.chip}</span>
        </Link>
      )}
    </div>
  )
}
