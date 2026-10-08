import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import {
  VERIFICATION,
  removeVehicle,
  vehicleDescription,
  vehiclePhoto,
  vehicleTypeLine,
  verificationOf,
} from '../../firebase/vehicles'
import useVehicle from '../../hooks/useVehicle'
import { formatDateTime } from '../../utils/format'
import VehicleStates from './VehicleStates'

// Not in the Figma file yet: opened by tapping a vehicle in My Vehicles.
// Read-only: vehicles come from the enforcement side, so there is nothing
// here for the owner to change.
const STATUS_NOTES = {
  [VERIFICATION.pending]: 'MTPB is still checking this vehicle. Its violations will show once it’s approved.',
  [VERIFICATION.active]: 'Verified by MTPB. Violations on this plate show in your Violation History.',
  [VERIFICATION.rejected]:
    'MTPB couldn’t verify this vehicle. Visit the MTPB office to have its records corrected.',
}

export default function VehicleDetails() {
  const { vehicleId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { status, vehicle } = useVehicle(user?.uid, vehicleId)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')

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
  const photo = vehiclePhoto(vehicle)
  const info = [
    ['Vehicle Type', vehicle.vehicleType],
    ['Wheel Category', vehicle.wheelCategory],
    ['Color', vehicle.color],
    ['Make', vehicle.make],
    ['Model', vehicle.model],
    ['Year', vehicle.year],
    // Kept from the old Registration card, which is gone: engine, chassis
    // and OR/CR numbers belong to the enforcement side, not to this screen.
    ['Added On', formatDateTime(vehicle.createdAt, { short: true })],
  ]

  async function handleRemove() {
    setRemoving(true)
    setRemoveError('')
    try {
      await removeVehicle(user.uid, vehicle)
      navigate('/vehicles', { replace: true })
    } catch (err) {
      console.error('Could not remove vehicle', err)
      setRemoveError('We couldn’t remove this vehicle. Check your connection and try again.')
      setRemoving(false)
    }
  }

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
          <StatusBadge status={verification} className="vehicle-details__badge" />
        </section>

        <div className={`info-note vehicle-details__status vehicle-details__status--${verification}`}>
          <p>{STATUS_NOTES[verification]}</p>
          {verification === VERIFICATION.rejected && vehicle.rejectionReason && (
            <p>
              <strong>Reason:</strong> {vehicle.rejectionReason}
            </p>
          )}
        </div>

        <DetailSection title="Vehicle Information" rows={info} />

        <div className="vehicle-details__actions">
          {verification === VERIFICATION.active && (
            <Link
              className="btn btn--pay btn--primary"
              to={`/violations?plate=${encodeURIComponent(vehicle.plateNumber)}`}
              state={{ from: `/vehicles/${encodeURIComponent(vehicleId)}` }}
            >
              View Violations
            </Link>
          )}
          <button type="button" className="btn btn--pay btn--danger-outline" onClick={() => setConfirmOpen(true)}>
            Remove Vehicle
          </button>
        </div>
      </main>

      <Modal
        open={confirmOpen}
        onClose={() => !removing && setConfirmOpen(false)}
        labelledBy="remove-title"
        className="confirm-modal"
      >
        <h2 id="remove-title" className="confirm-modal__title">
          Remove {vehicle.plateNumber}?
        </h2>
        <p className="confirm-modal__text">
          It will no longer appear in your account, and its violations will stop showing here. Your past payments
          and receipts stay on record. To add it back, you’ll need to register it and wait for verification again.
        </p>
        {removeError && (
          <p className="form-message form-message--error" role="alert">
            {removeError}
          </p>
        )}
        <div className="confirm-modal__actions">
          <button
            type="button"
            className="btn btn--pay btn--outline"
            onClick={() => setConfirmOpen(false)}
            disabled={removing}
          >
            Cancel
          </button>
          <button type="button" className="btn btn--pay btn--danger" onClick={handleRemove} disabled={removing}>
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function DetailSection({ title, rows }) {
  return (
    <section className="card vehicle-details__section">
      <h3 className="vehicle-details__section-title">{title}</h3>
      <dl className="vehicle-details__list">
        {rows.map(([label, value]) => (
          <div className="vehicle-details__row" key={label}>
            <dt>{label}</dt>
            <dd>{value || value === 0 ? value : <span className="vehicle-details__muted">—</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
