import { lazy, Suspense } from 'react'
import LanguageToggle from '../components/LanguageToggle'
import PageHeader from '../components/PageHeader'
import { directionsUrl, IMPOUND_LOTS } from '../data/places'
import { useT } from '../i18n/language-context'

// Leaflet is only downloaded when a map is actually shown.
const LocationMap = lazy(() => import('../components/LocationMap'))

// Where impounded vehicles are taken. A stand-in page for the map part of the
// Figma "IMPOUND DETAILS" / "OFFICE HOURS" screens, which aren't built yet.
export default function ImpoundLocation() {
  const lot = IMPOUND_LOTS[0]
  const t = useT()

  return (
    <div className="page">
      <PageHeader title={t('impound.title')} back action={<LanguageToggle />} />

      <main className="page__body">
        <section className="card map-card" aria-labelledby="impound-name">
          <Suspense fallback={<div className="location-map location-map--loading" style={{ height: 240 }} />}>
            <LocationMap
              center={lot.position}
              markers={[{ id: lot.id, position: lot.position, label: lot.name }]}
              label={t('common.mapShowing', { name: lot.name })}
            />
          </Suspense>

          <div className="map-card__body">
            <h2 id="impound-name" className="screen-title">
              {lot.name}
            </h2>
            <p className="screen-subtitle">{lot.area}</p>
            <a className="btn btn--primary" href={directionsUrl(lot.position)} target="_blank" rel="noreferrer">
              {t('impound.directions')}
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}
