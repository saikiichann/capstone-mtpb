import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { callApi } from '../api'
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
// the vehicle. The MTPB office scans the same QR with a USB scanner on its
// own page (cash-payment-qr-spec.md).
export default function PaymentCheck() {
  const { paymentId } = useParams()
  const t = useT()
  const [result, setResult] = useState({ id: null, status: 'loading', payment: null })

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
  }, [paymentId])

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
        {status === 'ready' && <PaymentCard payment={result.payment} />}
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
          {state === 'paid' || state === 'verifying' ? (
            <StatusBadge status={state} />
          ) : (
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
