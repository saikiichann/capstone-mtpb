import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import {
  VERIFICATION,
  vehicleDescription,
  vehiclePhoto,
  vehicleTypeLine,
  isFromPayment,
  vehicleBadge,
  verificationOf,
  wheelCategoryOf,
} from '../../firebase/vehicles'
import useVehicle from '../../hooks/useVehicle'
import { formatDateTime } from '../../utils/format'
import VehicleStates from './VehicleStates'

// Not in the Figma file yet: opened by tapping a vehicle in My Vehicles.
// Read-only: vehicles come from the enforcement side, so there is nothing
// here for the owner to change or remove. A vehicle can also arrive from a
// payment the owner made (checklist P1, server/account-links.js): it stays
// pending and shows only the violations they paid.
const STATUS_NOTES = {
  [VERIFICATION.pending]: 'MTPB is still checking this vehicle. Its violations will show once it’s approved.',
  [VERIFICATION.active]: 'Verified by MTPB. Violations on this plate show in your Violation History.',
  [VERIFICATION.rejected]:
    'MTPB couldn’t verify this vehicle. Visit the MTPB office to have its records corrected.',
}
const FROM_PAYMENT_NOTE =
  'Your violations and payments on this plate. New violations on this plate show here too, so you can pay them in the app.'

export default function VehicleDetails() {
  const { vehicleId } = useParams()
  const { user } = useAuth()
  const { status, vehicle } = useVehicle(user?.uid, vehicleId)

  if (status !== 'ready') {
    return (
      <div className="page">
        <PageHeader title="Vehicle Details" back="/vehicles" />
        <main className="page__body">
          <VehicleStates status={status} />
        </main>
      </div>
    )
  }

  const verification = verificationOf(vehicle)
  const fromPayment = isFromPayment(vehicle)
  const backHere = { from: `/vehicles/${encodeURIComponent(vehicleId)}` }
  const photo = vehiclePhoto(vehicle)
  const info = [
    ['Vehicle Type', vehicle.vehicleType],
    // Always shown, even when empty (Marco).
    ['Wheel Category', wheelCategoryOf(vehicle), { always: true }],
    ['Color', vehicle.color],
    ['Make', vehicle.make],
    ['Model', vehicle.model],
    ['Year', vehicle.year],
    // Kept from the old Registration card, which is gone: engine, chassis
    // and OR/CR numbers belong to the enforcement side, not to this screen.
    ['Added On', formatDateTime(vehicle.createdAt, { short: true })],
  ]

  return (
    <div className="page">
      <PageHeader title="Vehicle Details" back="/vehicles" />

      <main className="page__body vehicle-details">
        <section className="card vehicle-details__hero">
          <span
            className={`vehicle-details__photo${photo.isStock ? ' vehicle-details__photo--stock' : ''}${photo.isTypePhoto ? ' vehicle-details__photo--type' : ''}`}
          >
            <img src={photo.src} width={150} height={150} alt="" />
          </span>
          <h2 className="vehicle-details__plate">{vehicle.plateNumber}</h2>
          <p className="vehicle-details__model">{vehicleDescription(vehicle) || vehicleTypeLine(vehicle)}</p>
          <StatusBadge status={vehicleBadge(vehicle)} className="vehicle-details__badge" />
        </section>

        {/* Minimal for vehicles from a payment: a plain line, not a box. */}
        {fromPayment ? (
          <p className="vehicle-details__caption">{FROM_PAYMENT_NOTE}</p>
        ) : (
          <div className={`info-note vehicle-details__status vehicle-details__status--${verification}`}>
            <p>{STATUS_NOTES[verification]}</p>
            {verification === VERIFICATION.rejected && vehicle.rejectionReason && (
              <p>
                <strong>Reason:</strong> {vehicle.rejectionReason}
              </p>
            )}
          </div>
        )}

        <DetailSection title="Vehicle Information" rows={info} />

        {(verification === VERIFICATION.active || fromPayment) && (
          <div className="vehicle-details__actions">
            <Link
              className="btn btn--pay btn--primary"
              to={`/violations?plate=${encodeURIComponent(vehicle.plateNumber)}`}
              state={backHere}
            >
              View Violations
            </Link>
            {/* The plate works as a filter: only this vehicle's payments. */}
            <Link
              className="btn btn--pay btn--outline"
              to={`/payments?plate=${encodeURIComponent(vehicle.plateNumber)}`}
              state={backHere}
            >
              View Payments
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}

// Rows with nothing in them are left out, so the card stays short, except
// the ones marked `always` (shown with a dash).
function DetailSection({ title, rows }) {
  const hasValue = (value) => Boolean(value) || value === 0
  const filled = rows.filter(([, value, options]) => hasValue(value) || options?.always)
  return (
    <section className="card vehicle-details__section">
      <h3 className="vehicle-details__section-title">{title}</h3>
      <dl className="vehicle-details__list">
        {filled.map(([label, value]) => (
          <div className="vehicle-details__row" key={label}>
            <dt>{label}</dt>
            <dd>{hasValue(value) ? value : <span className="vehicle-details__muted">—</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
