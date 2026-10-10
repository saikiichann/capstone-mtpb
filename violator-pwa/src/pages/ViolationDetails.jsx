import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import LanguageToggle from '../components/LanguageToggle'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EvidencePhotos from '../components/EvidencePhotos'
import ViolationStates from '../components/ViolationStates'
import useViolation from '../hooks/useViolation'
import { useT } from '../i18n/language-context'
import { evidencePhotosOf } from '../utils/evidence'
import PayChoiceDialog from './PayChoiceDialog'
import { formatDateTime, formatPeso } from '../utils/format'

// The page a violator lands on after scanning the QR code on the clamp.
// - Signed out: Figma "VIOLATION DETAILS" (997:328). Pay Now asks whether to
//   pay as a guest or make an account first; Login / Make an Account are
//   still there for people who aren't in a hurry.
// - Signed in (or a guest mid-payment): Figma "VIOLATION DETAILS 2" with the
//   UNPAID badge and Pay Now (or PAID + View Receipt once paid).
export default function ViolationDetails() {
  const { violationRef } = useParams()
  const { user, guestChoseCheckout } = useAuth()
  const t = useT()
  const isOwner = Boolean(user?.emailVerified && !user.isGuest)
  // Everyone who scans is signed in anonymously just to read the violation,
  // so being a guest isn't enough — they have to have chosen "Pay now as
  // guest" first. Otherwise the choice dialog would never appear.
  const isGuest = Boolean(user?.isGuest && guestChoseCheckout)
  const canPayNow = isOwner || isGuest
  const { status, violation } = useViolation(violationRef, canPayNow ? user.uid : null)
  const [choiceOpen, setChoiceOpen] = useState(false)

  return (
    <div className={`page violation-page${canPayNow ? ' violation-page--owner' : ''}`}>
      <PageHeader title={t('violation.title')} back={isOwner || undefined} action={<LanguageToggle />} />

      <main className="page__body">
        {status !== 'ready' ? (
          <ViolationStates status={status} cin={violationRef} />
        ) : canPayNow ? (
          <>
            <ViolationCard violation={violation} showPayment />
            <EvidencePhotos photos={evidencePhotosOf(violation)} />
          </>
        ) : (
          <>
            <h2 className="screen-title">{t('violation.found')}</h2>
            <p className="screen-subtitle">{t('violation.review')}</p>
            <ViolationCard violation={violation} onPayNow={() => setChoiceOpen(true)} />
            <EvidencePhotos photos={evidencePhotosOf(violation)} />
          </>
        )}
      </main>

      <PayChoiceDialog open={choiceOpen} violationRef={violation?.id ?? violationRef} onClose={() => setChoiceOpen(false)} />
    </div>
  )
}

// The admin app writes "clamped" while everything beside it is Title Case.
const sentenceCase = (text) => text.charAt(0).toUpperCase() + text.slice(1)

function ViolationCard({ violation, showPayment = false, onPayNow }) {
  const t = useT()
  const isPaid = violation.paymentStatus === 'paid'
  const badge = isPaid ? (violation.awaitingVerification ? 'verifying' : 'paid') : 'unpaid'
  const here = `/v/${encodeURIComponent(violation.id ?? violation.cin)}`
  // Order asked for by MTPB. Rows whose value is missing still show a dash,
  // so the layout doesn't jump about between violations — except the two
  // that only some records carry. The labels and the clamped / impounded
  // word stay in English in both languages (Marco's choice): they match the
  // record MTPB keeps.
  const rows = [
    // Payment status isn't repeated here — the badge in the header says it.
    ...(violation.enforcementType ? [['Enforcement', sentenceCase(violation.enforcementType)]] : []),
    ['Plate Number', violation.plateNumber],
    ...(violation.clampId ? [['Clamp', violation.clampId]] : []),
    ['Make', violation.vehicleMake],
    ['Type', violation.vehicleType],
    ['Color', violation.vehicleColor],
    ['Violation', violation.violationType],
    ['Location', violation.location],
    ['Fine Amount', formatPeso(violation.fineAmount), 'danger'],
    ['Officer', violation.officerName],
  ]

  return (
    <section className="card violation-card" aria-label={t('violation.cardLabel', { cin: violation.cin })}>
      <div className="violation-card__head">
        <div className="violation-card__title-row">
          <p className="violation-card__cin">{violation.cin}</p>
          {showPayment && <StatusBadge status={badge} />}
        </div>
        <div className="violation-card__meta">
          <span>{formatDateTime(violation.clampedAt)}</span>
          <span className="violation-card__status">{violation.status}</span>
        </div>
      </div>

      {showPayment && <hr className="violation-card__divider" />}

      <dl className="detail-list">
        {rows.map(([label, value, tone]) => (
          <div className="detail-list__row" key={label}>
            <dt>{label}</dt>
            <dd className={tone === 'danger' ? 'detail-list__value--danger' : undefined}>
              {value || '—'}
            </dd>
          </div>
        ))}
      </dl>

      {!isPaid && violation.rejectionReason && (
        <p className="notice">
          {t('violation.rejected', { reason: violation.rejectionReason })}
          <br />
          {t('violation.payAgain')}
        </p>
      )}

      {showPayment ? (
        <div className="violation-card__pay">
          <hr className="violation-card__divider" />
          {isPaid ? (
            <Link className="btn btn--pay btn--primary" to={`/receipts/${violation.referenceNumber}`}>
              {t('violation.viewReceipt')}
            </Link>
          ) : (
            <Link className="btn btn--pay btn--primary" to={`${here}/pay`}>
              {t('common.payNow')}
            </Link>
          )}
        </div>
      ) : isPaid ? (
        <>
          <p className="notice notice--paid">
            {violation.awaitingVerification ? t('violation.awaiting') : t('violation.alreadyPaid')}
            <br />
            {t('violation.waitEnforcer')}
          </p>
          <p className="violation-card__hint">{t('violation.guestReceipt')}</p>
        </>
      ) : (
        <>
          <p className="notice">
            {t('violation.avoid')}
            <br />
            {t('violation.onTime')}
          </p>
          <div className="btn-stack">
            <button type="button" className="btn btn--primary" onClick={onPayNow}>
              {t('common.payNow')}
            </button>
            {/* Goes to Welcome rather than straight to the form, so someone
                new meets the app first. Welcome passes `returnTo` on to Sign
                Up, which is how they land back here afterwards. */}
            <Link className="btn btn--secondary" to="/welcome" state={{ returnTo: here }}>
              {t('violation.makeAccount')}
            </Link>
            <Link className="text-button" to="/login" state={{ returnTo: here }}>
              {t('violation.login')}
            </Link>
          </div>
        </>
      )}

      {/* Guests who scanned a clamp have no Home or Profile to find the
          FAQs from, so the link is here for everyone. */}
      <p className="violation-card__hint">
        {t('violation.questions')}{' '}
        <Link className="text-link" to="/faq">
          {t('common.readFaqs')}
        </Link>
      </p>
    </section>
  )
}
