import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import SuccessCheck from '../../components/SuccessCheck'
import useCountUp from '../../hooks/useCountUp'
import { checkPayment } from '../../payments'
import { formatDateTime, formatPeso } from '../../utils/format'
import { breakdownRows } from '../../utils/paymentRows'
import { ProcessingPayment } from './PayConfirm'

// Figma "PAYMENT SUBMITTED". PayMongo sends people back here after the GCash
// page, with the checkout attempt in the address. The payment may still be
// "pending" for a few seconds until PayMongo confirms, so this page asks the
// backend every few seconds. Once paid, the backend has recorded it in the
// admin app with a REF number, waiting for MTPB staff to verify it.
//
// The green "A receipt has been sent to …" note stays hidden until sending
// emails is set up on the backend (flip SHOW_EMAIL_NOTE then).
const SHOW_EMAIL_NOTE = false
const CHECK_EVERY_MS = 4000
const MAX_CHECKS = 10

export default function PaymentSuccess() {
  const { reference: paymentId } = useParams()
  const { user } = useAuth()
  const isGuest = Boolean(user?.isGuest)
  const [result, setResult] = useState({ status: 'loading', payment: null })
  const [checks, setChecks] = useState(0)
  const { status, payment } = result
  const waiting = status === 'loading' || status === 'pending'
  // The one figure worth drawing the eye to on this screen. Called here,
  // above the early returns, because hooks must run in the same order every
  // render.
  const total = useCountUp(status === 'paid' ? payment.amount : 0)

  useEffect(() => {
    if (!waiting || checks >= MAX_CHECKS) return undefined
    let cancelled = false
    const timer = setTimeout(
      () => {
        checkPayment(user.uid, paymentId)
          .then((next) => !cancelled && setResult(next))
          .catch((err) => {
            console.warn('Payment check failed', err)
            if (!cancelled && checks + 1 >= MAX_CHECKS) setResult({ status: 'error', payment: null })
          })
          .finally(() => !cancelled && setChecks((n) => n + 1))
      },
      checks === 0 ? 300 : CHECK_EVERY_MS,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [waiting, checks, user.uid, paymentId])

  const violationRef = payment?.violationId || payment?.violationCin

  if (status === 'missing') return <Navigate to="/violations" replace />
  if (status === 'error') {
    return (
      <ProblemCard title="We couldn’t load this payment">
        Check your connection and open this page again.
      </ProblemCard>
    )
  }

  if (waiting) {
    if (checks < MAX_CHECKS) {
      return <ProcessingPayment lines={['Confirming your payment...', 'Please wait.']} />
    }
    return (
      <ProblemCard title="Still waiting for confirmation" violationRef={violationRef}>
        We haven’t received confirmation from GCash yet. If you completed the payment, check again in a
        minute.
        <button type="button" className="btn btn--pay btn--primary" onClick={() => setChecks(0)}>
          Check again
        </button>
      </ProblemCard>
    )
  }

  // Money came in, but the violation had already been paid another way
  // (for example at the office) while this checkout was open.
  if (status === 'duplicate' || status === 'review') {
    return (
      <ProblemCard
        title={status === 'duplicate' ? 'This violation was already paid' : 'We need to check this payment'}
        reference={paymentId}
        violationRef={violationRef}
      >
        {status === 'duplicate'
          ? 'Your GCash payment went through, but this violation had already been paid. '
          : 'Your GCash payment went through, but it needs to be checked by MTPB staff. '}
        Please visit the MTPB office with this page or your GCash confirmation so personnel can sort it out.
      </ProblemCard>
    )
  }

  // Didn't go through (cancelled, expired, failed): the violation is simply
  // unpaid. Back to it, where Pay Now is waiting.
  if (status !== 'paid') {
    return <Navigate to={violationRef ? `/v/${encodeURIComponent(violationRef)}` : '/violations'} replace />
  }

  const rows = [
    ['Reference Number', payment.referenceNumber],
    // The CIN is the code printed on the clamp; the violation ID is the
    // record itself, which is what MTPB staff look up. Both are shown here
    // and on the receipt, and nowhere else.
    ['Violation Number', payment.violationCin],
    ...(payment.violationId && payment.violationId !== payment.violationCin
      ? [['Violation ID', payment.violationId]]
      : []),
    ['Plate Number', payment.plateNumber],
    ['Date & Time', formatDateTime(payment.paidAt, { short: true })],
    ...breakdownRows(payment),
  ]

  return (
    <div className="page">
      <main className="success-body">
        <SuccessCheck size={124} />
        <h1 className="success-body__title success-body__title--rise">Payment Successful</h1>
        <p className="success-body__text success-body__text--rise">
          {payment.awaitingVerification
            ? 'Your payment was received. MTPB staff will verify it shortly.'
            : 'Your payment has been processed successfully.'}
        </p>

        <section className="card summary-card" aria-label="Payment summary">
          <dl className="summary-list">
            {rows.map(([label, value]) => (
              <div className="summary-list__row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <hr className="summary-card__divider" />
          <div className="summary-list__row summary-list__row--total">
            <span>Total Amount</span>
            <strong className="detail-list__value--danger">{formatPeso(total)}</strong>
          </div>
        </section>

        {SHOW_EMAIL_NOTE && payment.email && (
          <p className="success-body__email">
            A receipt has been sent to
            <br />
            <strong>{payment.email}</strong>
          </p>
        )}

        {isGuest && (
          <p className="info-note success-body__guest">
            You paid as a guest, so this receipt is only here while this page is open. Open it and download a
            copy before you leave.
          </p>
        )}

        <Link
          className="btn btn--pay btn--primary success-body__cta"
          to={`/receipts/${encodeURIComponent(payment.referenceNumber)}`}
          replace
        >
          See Receipt
        </Link>
      </main>
    </div>
  )
}

function ProblemCard({ title, reference, violationRef, children }) {
  return (
    <div className="page">
      <main className="page__body problem-body">
        <div className="card state-card">
          <h1 className="screen-title">{title}</h1>
          {reference && (
            <p>
              Reference: <strong>{reference}</strong>
            </p>
          )}
          <div className="problem-body__text">{children}</div>
          {violationRef && (
            <Link className="btn btn--pay btn--outline" to={`/v/${encodeURIComponent(violationRef)}`}>
              Back to violation
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}
