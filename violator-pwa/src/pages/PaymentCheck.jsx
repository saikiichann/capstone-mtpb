import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { callApi } from '../api'
import { useAuth } from '../auth/auth-context'
import LanguageToggle from '../components/LanguageToggle'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { ensureSignedIn } from '../firebase/auth'
import { shouldUseSampleData } from '../firebase/config'
import { useT } from '../i18n/language-context'
import { formatDateTime, formatPeso } from '../utils/format'

// Opened by scanning the QR on a cash payment slip: /r/<payment id>.
// Anyone holding the slip can check it's genuine and see its status; the
// server (api/payment-check.js) returns only what's needed to match it to
// the vehicle. (MTPB staff no longer scan slips: they verify cash payments
// from the queue on Payment Verification.)
//
// Once MTPB has verified a cash payment, a signed-in account can add it
// within 7 days ("Add to My Account", server/account-links.js).
export default function PaymentCheck() {
  const { paymentId } = useParams()
  const t = useT()
  const { user } = useAuth()
  const [result, setResult] = useState({ id: null, status: 'loading', payment: null })

  // Asked again when someone signs in here, so the card matches who's looking.
  const viewer = user?.uid ?? null
  useEffect(() => {
    let cancelled = false
    async function load() {
      // Sample data has no payment records to check.
      if (shouldUseSampleData) return { status: 'not-found', payment: null }
      await ensureSignedIn()
      try {
        const { payment } = await callApi('payment-check', { id: paymentId })
        return { status: 'ready', payment }
      } catch (err) {
        if (err?.status === 404) return { status: 'not-found', payment: null }
        throw err
      }
    }
    load()
      .then((next) => !cancelled && setResult({ id: paymentId, ...next }))
      .catch((err) => {
        console.error('Could not check payment', err)
        if (!cancelled) setResult({ id: paymentId, status: 'error', payment: null })
      })
    return () => {
      cancelled = true
    }
  }, [paymentId, viewer])

  const status = result.id === paymentId ? result.status : 'loading'

  return (
    <div className="page">
      <PageHeader title={t('check.title')} action={<LanguageToggle />} />
      <main className="page__body">
        {status === 'loading' && (
          <div className="card state-card" role="status">
            <p>{t('check.loading')}</p>
          </div>
        )}
        {status === 'not-found' && (
          <div className="card state-card" role="alert">
            <h2 className="screen-title">{t('check.notFound.title')}</h2>
            <p>{t('check.notFound.text')}</p>
          </div>
        )}
        {status === 'error' && (
          <div className="card state-card" role="alert">
            <h2 className="screen-title">{t('common.somethingWrong')}</h2>
            <p>{t('check.error')}</p>
          </div>
        )}
        {status === 'ready' && (
          <>
            <PaymentCard payment={result.payment} />
            <ClaimCard paymentId={paymentId} payment={result.payment} />
          </>
        )}
      </main>
    </div>
  )
}

function PaymentCard({ payment }) {
  const t = useT()
  const known = ['paid', 'verifying', 'rejected'].includes(payment.status)
  const state = known ? payment.status : 'unpaid'
  const rows = [
    [t('check.row.reference'), payment.referenceNumber],
    [t('check.row.method'), payment.method],
    [t('check.row.amount'), formatPeso(payment.amount)],
    [t('check.row.date'), formatDateTime(payment.paidAt)],
    [t('check.row.violation'), payment.violationCin],
    [t('check.row.plate'), payment.plateNumber],
  ]

  return (
    <section className="card violation-card" aria-label={payment.referenceNumber}>
      <div className="violation-card__head">
        <div className="violation-card__title-row">
          <p className="violation-card__cin">{t('check.valid')}</p>
          {state === 'verifying' && <StatusBadge status="verifying" />}
          {/* "verified" rather than "paid": on a slip, that's what the
              person is checking for. */}
          {state === 'paid' && (
            <span className="status-badge status-badge--success">{t('check.badge.verified')}</span>
          )}
          {(state === 'rejected' || state === 'unpaid') && (
            <span className="status-badge status-badge--danger">{t(`check.badge.${state}`)}</span>
          )}
        </div>
      </div>
      <p className={state === 'paid' || state === 'verifying' ? 'notice notice--paid' : 'notice'}>
        {t(`check.status.${state}`)}
      </p>
      <dl className="detail-list">
        {rows.map(([label, value]) => (
          <div className="detail-list__row" key={label}>
            <dt>{label}</dt>
            <dd>{value || '—'}</dd>
          </div>
        ))}
      </dl>
      <p className="violation-card__hint">{t('check.match')}</p>
    </section>
  )
}

// The "Add to My Account" card under a cash payment (checklist P1).
function ClaimCard({ paymentId, payment }) {
  const t = useT()
  const { user } = useAuth()
  const location = useLocation()
  const [added, setAdded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const claim = payment.claim ?? { state: 'not-cash' }
  const state = added ? 'yours' : error?.state ?? claim.state
  if (state === 'not-cash') return null

  const here = location.pathname
  const isAccount = Boolean(user && !user.isGuest && user.emailVerified)

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await callApi('account-links', { action: 'claim-cash', paymentId })
      setAdded(true)
    } catch (err) {
      setError({ state: err?.data?.state ?? null, message: err.message })
    } finally {
      setBusy(false)
    }
  }

  if (state === 'verify-first') {
    return (
      <section className="card claim-card">
        <h2 className="claim-card__title">{t('claim.wait.title')}</h2>
        <p>{t('claim.wait.text')}</p>
        <p className="claim-card__small">{t('claim.wait.note')}</p>
      </section>
    )
  }

  if (state === 'yours') {
    return (
      <section className="card claim-card claim-card--done" role="status">
        <h2 className="claim-card__title">{t('claim.done.title')}</h2>
        <p>{t('claim.done.text', { plate: payment.plateNumber })}</p>
        {isAccount && (
          <div className="btn-stack">
            <Link className="btn btn--primary" to="/payments">
              {t('claim.viewPayments')}
            </Link>
          </div>
        )}
      </section>
    )
  }

  if (state === 'taken' || state === 'expired' || state === 'rejected') {
    return (
      <section className="card claim-card claim-card--stop" role="alert">
        <h2 className="claim-card__title">{t(`claim.${state}.title`)}</h2>
        <p>{t(`claim.${state}.text`)}</p>
      </section>
    )
  }

  // 'available'
  if (!isAccount) {
    return (
      <section className="card claim-card">
        <h2 className="claim-card__title">{t('claim.keep.title')}</h2>
        <p>{t('claim.keep.text', { date: formatDateTime(claim.deadline) })}</p>
        <div className="btn-stack">
          <Link className="btn btn--primary" to="/login" state={{ returnTo: here }}>
            {t('claim.login')}
          </Link>
          <Link className="btn btn--secondary" to="/signup" state={{ returnTo: here }}>
            {t('claim.signup')}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="card claim-card">
      <h2 className="claim-card__title">{t('claim.confirm.title')}</h2>
      <p>{t('claim.confirm.text', { cin: payment.violationCin, plate: payment.plateNumber })}</p>
      {error && (
        <p className="field__error" role="alert">
          {error.message}
        </p>
      )}
      <div className="btn-stack">
        <button type="button" className="btn btn--primary" onClick={add} disabled={busy}>
          {busy ? t('claim.adding') : t('claim.add')}
        </button>
      </div>
      <p className="claim-card__small">{t('claim.signedInAs', { email: user.email })}</p>
    </section>
  )
}
