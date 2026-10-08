import { isActiveVehicle, vehicleDescription, vehiclePhoto, verificationOf } from '../firebase/vehicles'
import StatusBadge from './StatusBadge'

// Home's vehicle card. Display only — My Vehicles is one row down in Quick
// Access, so this card doesn't need to be a second way there.
//
// Laid out like a wallet pass: the plate in a plate-style chip on the left,
// the car parked on the right and running off the card's edge. Type photos
// are mirrored here to face into the card (see App.css); an MTPB photo is
// shown as it was taken.
export default function VehicleCard({ vehicle }) {
  const photo = vehiclePhoto(vehicle)
  const description = vehicleDescription(vehicle)
  const meta = [vehicle.vehicleType, vehicle.color].filter(Boolean).join(' · ')

  return (
    <section className="vehicle-hero" aria-label={`Your vehicle: ${vehicle.plateNumber}`}>
      <div className="vehicle-hero__text">
        <p className="vehicle-hero__eyebrow">Your vehicle</p>
        <p className="vehicle-hero__plate">{vehicle.plateNumber}</p>
        {description && <p className="vehicle-hero__model">{description}</p>}
        {meta && <p className="vehicle-hero__meta">{meta}</p>}
        {!isActiveVehicle(vehicle) && (
          <StatusBadge status={verificationOf(vehicle)} className="vehicle-hero__badge" />
        )}
      </div>
      <div className={`vehicle-hero__art${photo.isTypePhoto ? ' vehicle-hero__art--type' : ''}`} aria-hidden="true">
        <span className="vehicle-hero__shadow" />
        <img
          className={`vehicle-hero__photo${photo.isStock ? ' vehicle-hero__photo--stock' : ''}`}
          src={photo.src}
          width={200}
          height={200}
          alt=""
        />
      </div>
    </section>
  )
}

export function VehicleCardPlaceholder({ state }) {
  if (state === 'loading') {
    return <div className="vehicle-hero vehicle-hero--loading" role="status" aria-label="Loading your vehicle" />
  }
  if (state === 'error') {
    return (
      <div className="vehicle-hero vehicle-hero--empty" role="alert">
        <p className="vehicle-hero__meta">We couldn’t load your vehicles. Check your connection and reopen the app.</p>
      </div>
    )
  }
  return (
    <section className="vehicle-hero vehicle-hero--empty" aria-label="No vehicle yet">
      <div className="vehicle-hero__text">
        <p className="vehicle-hero__eyebrow">Your vehicle</p>
        <p className="vehicle-hero__model">No vehicle yet</p>
        <p className="vehicle-hero__meta">Added when a violation is recorded</p>
      </div>
    </section>
  )
}
