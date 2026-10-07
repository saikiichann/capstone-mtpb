import { lazy, Suspense } from 'react'
import PageHeader from '../components/PageHeader'
import { directionsUrl, IMPOUND_LOTS } from '../data/places'

// Leaflet is only downloaded when a map is actually shown.
const LocationMap = lazy(() => import('../components/LocationMap'))

// Where impounded vehicles are taken. A stand-in page for the map part of the
// Figma "IMPOUND DETAILS" / "OFFICE HOURS" screens, which aren't built yet.
export default function ImpoundLocation() {
  const lot = IMPOUND_LOTS[0]

  return (
    <div className="page">
      <PageHeader title="Impound Location" back />

      <main className="page__body">
        <section className="card map-card" aria-labelledby="impound-name">
          <Suspense fallback={<div className="location-map location-map--loading" style={{ height: 240 }} />}>
            <LocationMap
              center={lot.position}
              markers={[{ id: lot.id, position: lot.position, label: lot.name }]}
              label={`Map showing ${lot.name}`}
            />
          </Suspense>

          <div className="map-card__body">
            <h2 id="impound-name" className="screen-title">
              {lot.name}
            </h2>
            <p className="screen-subtitle">{lot.area}</p>
            <a className="btn btn--primary" href={directionsUrl(lot.position)} target="_blank" rel="noreferrer">
              Get directions
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}
