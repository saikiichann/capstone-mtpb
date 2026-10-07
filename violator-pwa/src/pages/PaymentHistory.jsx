import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import PageHeader from '../components/PageHeader'
import { SkeletonList } from '../components/Skeleton'
import StatusBadge from '../components/StatusBadge'
import useMyViolations from '../hooks/useMyViolations'
import usePayments from '../hooks/usePayments'
import { formatDateTime, formatPeso } from '../utils/format'

// Figma "PAYMENT HISTORY". Only payments that went through are listed: an
// attempt that failed or was abandoned took no money, so it isn't history.
// - All: every completed payment
// - Paid: the ones that went through (each opens its receipt)
// - Unpaid: violations with no payment yet, so they can be paid from here
const TABS = [
  { id: 'all', label: 'All' },
  { id: 'paid', label: 'Paid' },
  { id: 'unpaid', label: 'Unpaid' },
]

export default function PaymentHistory() {
  const { user } = useAuth()
  // The History tab's "Pay Now" button opens this page on Unpaid.
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(() => (TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'all'))
  const { payments: allPayments, status: paymentsStatus } = usePayments(user?.uid)
  const payments = allPayments.filter((p) => p.isPaid)
  const { violations, status: violationsStatus } = useMyViolations(user?.uid)

  const unpaid = violations.filter((v) => v.paymentStatus !== 'paid')
  const shown = payments
  const status = tab === 'unpaid' ? violationsStatus : paymentsStatus
  const count = tab === 'unpaid' ? unpaid.length : shown.length

  return (
    <div className="page">
      <PageHeader title="Payment History" back="/history" />

      <main className="page__body history-body">
        <div className="segmented" role="group" aria-label="Filter payments">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              className="segmented__option"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {status === 'loading' && <SkeletonList rows={3} label="Loading payments" />}
        {status === 'error' && (
          <p className="empty-text" role="alert">
            We couldn’t load this. Check your connection and try again.
          </p>
        )}
        {status === 'ready' && count === 0 && (
          <p className="empty-text">
            {tab === 'unpaid' ? 'Nothing left to pay. ' : 'No payments yet. '}
            {tab !== 'unpaid' && <Link className="text-link" to="/violations">View your violations</Link>}
          </p>
        )}

        {status === 'ready' && count > 0 && (
          <ul className="history-list">
            {tab === 'unpaid'
              ? unpaid.map((v) => (
                  <li key={v.id ?? v.cin}>
                    <Link className="history-card" to={`/v/${encodeURIComponent(v.id ?? v.cin)}`}>
                      <span className="history-card__main">
                        <span className="history-card__cin">{v.cin}</span>
                        <span className="history-card__date">{formatDateTime(v.clampedAt, { short: true })}</span>
                        <span className="history-card__plate">{v.plateNumber}</span>
                      </span>
                      <span className="history-card__side">
                        <span className="history-card__amount">{formatPeso(v.fineAmount)}</span>
                        <StatusBadge status="unpaid" />
                      </span>
                      <span className="history-card__chevron" aria-hidden="true">
                        &gt;
                      </span>
                    </Link>
                  </li>
                ))
              : shown.map((p) => <PaymentRow key={p.referenceNumber} payment={p} />)}
          </ul>
        )}
      </main>
    </div>
  )
}

function PaymentRow({ payment }) {
  // Every row here is a completed payment, so every row opens its receipt.
  const to = `/receipts/${encodeURIComponent(payment.referenceNumber)}`

  return (
    <li>
      <Link className="history-card" to={to}>
        <span className="history-card__main">
          <span className="history-card__cin">{payment.referenceNumber}</span>
          <span className="history-card__date">
            {formatDateTime(payment.paidAt ?? payment.createdAt, { short: true })}
          </span>
          <span className="history-card__plate">{payment.plateNumber}</span>
        </span>
        <span className="history-card__side">
          <span className="history-card__amount">{formatPeso(payment.amount)}</span>
          <StatusBadge status={payment.awaitingVerification ? 'verifying' : 'paid'} />
        </span>
        <span className="history-card__chevron" aria-hidden="true">
          &gt;
        </span>
      </Link>
    </li>
  )
}
