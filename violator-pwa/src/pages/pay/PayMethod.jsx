import { lazy, Suspense, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import mtpbLogo from '../../assets/mtpb-logo.webp'
import gcashLogo from '../../assets/pay-gcash.webp'
import Modal from '../../components/Modal'
import OptionalAsset from '../../components/OptionalAsset'
import PageHeader from '../../components/PageHeader'
import { directionsUrl, IMPOUND_LOTS } from '../../data/places'
import StepIntro from '../../components/StepIntro'

const LocationMap = lazy(() => import('../../components/LocationMap'))

// Figma "PAYMENT METHOD 1" + "PAYMENT METHOD OVERLAY" (Pay Onsite).
export default function PayMethod() {
  const { violation } = useOutletContext()
  const [onsiteOpen, setOnsiteOpen] = useState(false)
  const base = `/v/${encodeURIComponent(violation.id ?? violation.cin)}/pay`
  const lot = IMPOUND_LOTS[0]

  return (
    <div className="page">
      <PageHeader title="Pay Now" back />

      <main className="page__body pay-body">
        <StepIntro step={1} title="Choose Payment">
          Select a payment method to continue.
        </StepIntro>

        <ul className="method-list">
          <li>
            <Link className="method-card" to={`${base}/gcash`}>
              <img className="method-card__logo" src={gcashLogo} width={98} height={98} alt="" />
              <span className="method-card__text">
                <span className="method-card__title">GCash</span>
                <span className="method-card__desc">Pay using your GCash account</span>
              </span>
              <span className="method-card__chevron" aria-hidden="true">&gt;</span>
            </Link>
          </li>
          <li>
            <button type="button" className="method-card" onClick={() => setOnsiteOpen(true)}>
              <span className="method-card__logo method-card__logo--icon">
                <OptionalAsset name="pay-onsite" width={70} height={70} />
              </span>
              <span className="method-card__text">
                <span className="method-card__title">Pay Onsite</span>
                <span className="method-card__desc">Pay at MTPB office.</span>
              </span>
              <span className="method-card__chevron" aria-hidden="true">&gt;</span>
            </button>
          </li>
        </ul>
      </main>

      <Modal open={onsiteOpen} onClose={() => setOnsiteOpen(false)} labelledBy="onsite-title" className="onsite-modal">
        <h2 id="onsite-title" className="onsite-modal__title">
          Payment Instructions
        </h2>
        <img className="onsite-modal__logo" src={mtpbLogo} width={100} height={101} alt="" />
        <p className="onsite-modal__lead">Proceed to</p>
        <p className="onsite-modal__place">{lot.name}</p>
        <a className="onsite-modal__address" href={directionsUrl(lot.position)} target="_blank" rel="noreferrer">
          {lot.address}
        </a>
        <Suspense fallback={<div className="location-map location-map--loading onsite-modal__map" style={{ height: 188 }} />}>
          <div className="onsite-modal__map">
            <LocationMap
              center={lot.position}
              zoom={16}
              height={188}
              markers={[{ id: lot.id, position: lot.position, label: lot.name }]}
              label={`Map showing ${lot.name}`}
            />
          </div>
        </Suspense>
        <button type="button" className="btn btn--primary onsite-modal__close" onClick={() => setOnsiteOpen(false)}>
          Go Back
        </button>
      </Modal>
    </div>
  )
}
