import { Link } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { AlertIcon, WalletIcon } from '../components/icons'
import useCountUp from '../hooks/useCountUp'
import useMyViolations from '../hooks/useMyViolations'
import usePayments from '../hooks/usePayments'
import { formatDateTime, formatPeso, toMillis } from '../utils/format'

// Figma "HISTORY DASHBOARD", with the amount due, live counts and recent
// activity added so the page answers "what do I owe?" at a glance.
// It's the History tab, so it keeps the bottom bar and has no back arrow.
const RECENT_COUNT = 3

export default function History() {
  const { user } = useAuth()
  const { status: violationsStatus, violations } = useMyViolations(user?.uid)
  const { status: paymentsStatus, payments } = usePayments(user?.uid)
  const loading = violationsStatus === 'loading' || paymentsStatus === 'loading'

  const unpaid = violations.filter((v) => v.paymentStatus !== 'paid')
  const amountDue = unpaid.reduce((sum, v) => sum + (Number(v.fineAmount) || 0), 0)
  const paidPayments = payments.filter((p) => p.isPaid)
  const paidTotal = paidPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const recent = recentActivity(violations, paidPayments)
  // The number someone opens this page to find out.
  const dueShown = useCountUp(amountDue, { enabled: !loading })

  return (
    <div className="page">
      <PageHeader title="History" />

      <main className="page__body history-home">
        {!loading &&
          (unpaid.length > 0 ? (
            <section className="card due-card due-card--owing" aria-label="Amount due">
              <p className="due-card__label">Total amount due</p>
              <p className="due-card__amount">{formatPeso(dueShown)}</p>
              <p className="due-card__meta">
                {unpaid.length} unpaid {unpaid.length === 1 ? 'violation' : 'violations'}
              </p>
              <Link className="btn btn--pay btn--primary due-card__cta" to="/payments?tab=unpaid">
                Pay Now
              </Link>
            </section>
          ) : (
            <section className="card due-card due-card--clear" aria-label="Amount due">
              <p className="due-card__clear-title">You’re all clear</p>
              <p className="due-card__meta">No unpaid violations on your vehicles.</p>
            </section>
          ))}

        <nav className="history-home__list" aria-label="Record categories">
          <Link to="/payments" className="card category-card category-card--green">
            <span className="category-card__icon">
              <WalletIcon width={30} height={26} />
            </span>
            <span className="category-card__text">
              <span className="category-card__title">Payment History</span>
              <span className="category-card__description">View all your payment transactions</span>
              {!loading && (
                <span className="category-card__meta">
                  {paidPayments.length} {paidPayments.length === 1 ? 'payment' : 'payments'} ·{' '}
                  {formatPeso(paidTotal)} paid
                </span>
              )}
            </span>
          </Link>

          <Link to="/violations" className="card category-card category-card--amber">
            <span className="category-card__icon">
              <AlertIcon width={30} height={27} />
            </span>
            <span className="category-card__text">
              <span className="category-card__title">Violation History</span>
              <span className="category-card__description">View all your recorded violations</span>
              {!loading && (
                <span className="category-card__meta">
                  {violations.length} total · {unpaid.length} unpaid
                </span>
              )}
            </span>
          </Link>
        </nav>

        {!loading && recent.length > 0 && (
          <section className="recent" aria-label="Recent activity">
            <h2 className="recent__title">Recent Activity</h2>
            <ul className="recent__list">
              {recent.map((item) => (
                <li key={item.key}>
                  <Link className="recent__item" to={item.to}>
                    <span className={`recent__dot recent__dot--${item.tone}`} aria-hidden="true" />
                    <span className="recent__text">
                      <span className="recent__label">{item.label}</span>
                      <span className="recent__date">{formatDateTime(item.at, { short: true })}</span>
                    </span>
                    <span className="recent__amount">{formatPeso(item.amount)}</span>
                    <StatusBadge status={item.badge} className="recent__badge" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

      </main>
    </div>
  )
}

// The newest few payments and violations, mixed together.
function recentActivity(violations, paidPayments) {
  const items = [
    ...paidPayments.map((p) => ({
      key: `pay-${p.referenceNumber}`,
      label: `Paid ${p.violationCin || p.referenceNumber}`,
      at: p.paidAt ?? p.createdAt,
      amount: p.amount,
      badge: 'paid',
      tone: 'green',
      to: `/receipts/${encodeURIComponent(p.referenceNumber)}`,
    })),
    ...violations
      .filter((v) => v.paymentStatus !== 'paid')
      .map((v) => ({
        key: `vio-${v.id ?? v.cin}`,
        label: v.cin,
        at: v.clampedAt,
        amount: v.fineAmount,
        badge: v.status,
        tone: v.status === 'impounded' ? 'red' : 'amber',
        to: `/v/${encodeURIComponent(v.id ?? v.cin)}`,
      })),
  ]
  return items.sort((a, b) => toMillis(b.at) - toMillis(a.at)).slice(0, RECENT_COUNT)
}
