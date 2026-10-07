import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import mtpbLogo from '../../assets/mtpb-logo.webp'
import { useAuth } from '../../auth/auth-context'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import SettingsRow from '../../components/SettingsRow'
import { BugIcon, ChatIcon, HelpIcon } from '../../components/icons/rows'
import { OFFICE_HOURS, OFFICE_PHONE, SUPPORT_EMAIL, supportMailto } from '../../data/contact'
import { directionsUrl, IMPOUND_LOTS } from '../../data/places'

const LocationMap = lazy(() => import('../../components/LocationMap'))

// Figma "HELP & SUPPORT".
// - Report a Problem doesn't take reports in the app: concerns about a
//   violation are legal matters MTPB handles in person, so it shows where
//   the office is, in the same style as the Pay Onsite instructions.
// - Contact Support opens the phone's email app with the details filled in.
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0'

export default function HelpSupport() {
  const { user } = useAuth()
  const [reportOpen, setReportOpen] = useState(false)
  const office = IMPOUND_LOTS[0]

  const contactLink = supportMailto({
    subject: 'MTPB app – question',
    lines: ['My question:', '', '---', `Account: ${user?.email ?? ''}`],
  })

  return (
    <div className="page">
      <PageHeader title="Help & Support" back="/profile" />

      <main className="page__body settings-body">
        <div className="card settings-group__list">
          <SettingsRow
            icon={<HelpIcon />}
            title="FAQs"
            description="Find answers to common questions"
            to="/faq"
          />
          <SettingsRow
            icon={<BugIcon />}
            title="Report a Problem"
            description="Handled in person at the MTPB office"
            onClick={() => setReportOpen(true)}
          />
          <SettingsRow
            icon={<ChatIcon />}
            title="Contact Support"
            description="Get help from the MTPB office"
            href={contactLink}
            last
          />
        </div>

        <div className="card support-card">
          <h2 className="settings-group__title">MTPB Office</h2>
          <dl className="support-list">
            <div>
              <dt>Email</dt>
              <dd>
                <a className="text-link" href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                <a className="text-link" href={`tel:${OFFICE_PHONE.replace(/[^\d+]/g, '')}`}>
                  {OFFICE_PHONE}
                </a>
              </dd>
            </div>
            <div>
              <dt>Office hours</dt>
              <dd>{OFFICE_HOURS}</dd>
            </div>
          </dl>
          <Link className="text-link support-card__map" to="/impound">
            Impound location and directions
          </Link>
        </div>

        <div className="card app-version">
          <span className="app-version__label">App Version</span>
          <span className="app-version__value">TVMS v{APP_VERSION}</span>
        </div>
      </main>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} labelledBy="report-title" className="onsite-modal">
        <h2 id="report-title" className="onsite-modal__title">
          Report a Problem
        </h2>
        <img className="onsite-modal__logo" src={mtpbLogo} width={100} height={101} alt="" />
        <p className="onsite-modal__lead">
          Concerns about a violation, fine or clamp are handled in person by MTPB. Proceed to
        </p>
        <p className="onsite-modal__place">{office.name}</p>
        <a className="onsite-modal__address" href={directionsUrl(office.position)} target="_blank" rel="noreferrer">
          {office.address}
        </a>
        <p className="onsite-modal__lead">{OFFICE_HOURS}</p>
        <Suspense fallback={<div className="location-map location-map--loading onsite-modal__map" style={{ height: 188 }} />}>
          <div className="onsite-modal__map">
            <LocationMap
              center={office.position}
              zoom={16}
              height={188}
              markers={[{ id: office.id, position: office.position, label: office.name }]}
              label={`Map showing ${office.name}`}
            />
          </div>
        </Suspense>
        <button type="button" className="btn btn--primary onsite-modal__close" onClick={() => setReportOpen(false)}>
          Go Back
        </button>
      </Modal>
    </div>
  )
}
