import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import PageHeader from '../components/PageHeader'
import { SkeletonList } from '../components/Skeleton'
import StatusBadge from '../components/StatusBadge'
import { samePlate } from '../firebase/vehicles'
import useMyViolations from '../hooks/useMyViolations'
import { formatDateTime, formatPeso } from '../utils/format'

// Figma "VIOLATION HISTORY". Lists violations on the owner's verified
// vehicles.
// - All: everything, paid ones with a PAID badge
// - Clamped / Impounded: unpaid ones in that state
// Paid ones have no tab of their own: Payment History already lists them.
// `?plate=ABC 1234` narrows the list to one vehicle (from Vehicle Details).
const isPaid = (v) => v.paymentStatus === 'paid'

const FILTERS = [
  { id: 'all', label: 'All', test: () => true, empty: 'No violations on your registered vehicles.' },
  {
    id: 'clamped',
    label: 'Clamped',
    test: (v) => v.status === 'clamped' && !isPaid(v),
    empty: 'No unpaid clamped violations.',
  },
  {
    id: 'impounded',
    label: 'Impounded',
    test: (v) => v.status === 'impounded' && !isPaid(v),
    empty: 'No unpaid impounded violations.',
  },
]

export default function ViolationHistory() {
  const { user } = useAuth()
  const { status, violations, unverifiedPlates } = useMyViolations(user?.uid)
  const [searchParams, setSearchParams] = useSearchParams()
  // Back always goes to History, except when a vehicle's View Violations
  // opened this page — then it returns to that vehicle.
  const location = useLocation()
  const backTo = location.state?.from ?? '/history'
  const [filterId, setFilterId] = useState('all')
  const plate = searchParams.get('plate')

  const forPlate = plate ? violations.filter((v) => samePlate(v.plateNumber, plate)) : violations
  const filter = FILTERS.find((f) => f.id === filterId)
  const shown = forPlate.filter(filter.test)
  const unverified = plate ? unverifiedPlates.filter((p) => samePlate(p, plate)) : unverifiedPlates

  return (
    <div className="page">
      <PageHeader title="Violation History" back={backTo} />

      <main className="page__body history-body">
        <div className="segmented" role="group" aria-label="Filter violations">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filterId === f.id}
              className="segmented__option"
              onClick={() => setFilterId(f.id)}
            >
              {f.label}
              {status === 'ready' && <span className="segmented__count">{forPlate.filter(f.test).length}</span>}
            </button>
          ))}
        </div>

        {plate && (
          <p className="history-body__plate-filter">
            <span>
              Showing <strong>{plate}</strong> only
            </span>
            <button type="button" className="text-button" onClick={() => setSearchParams({}, { replace: true, state: location.state })}>
              Show all vehicles
            </button>
          </p>
        )}

        {status === 'loading' && <SkeletonList rows={3} label="Loading your violations" />}
        {status === 'error' && (
          <p className="empty-text" role="alert">
            We couldn’t load your violations. Check your connection and try again.
          </p>
        )}
        {status === 'ready' && shown.length === 0 && <p className="empty-text">{filter.empty}</p>}

        {shown.length > 0 && (
          <ul className="history-list">
            {shown.map((v) => (
              <li key={v.id ?? v.cin}>
                <Link className="history-card" to={`/v/${encodeURIComponent(v.id ?? v.cin)}`}>
                  <span className="history-card__main">
                    <span className="history-card__cin">{v.cin}</span>
                    <span className="history-card__date">{formatDateTime(v.clampedAt)}</span>
                    <span className="history-card__plate">{v.plateNumber}</span>
                    <span className="history-card__type">{v.violationType}</span>
                  </span>
                  <span className="history-card__side">
                    <span className="history-card__amount">{formatPeso(v.fineAmount)}</span>
                    <StatusBadge status={isPaid(v) ? (v.awaitingVerification ? 'verifying' : 'paid') : v.status} />
                  </span>
                  <span className="history-card__chevron" aria-hidden="true">
                    &gt;
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {status === 'ready' && unverified.length > 0 && (
          <p className="info-note history-body__pending">
            <strong>{unverified.join(', ')}</strong> {unverified.length === 1 ? 'isn’t' : 'aren’t'} verified by MTPB
            yet, so {unverified.length === 1 ? 'its' : 'their'} violations aren’t shown here.{' '}
            <Link className="text-link" to="/vehicles">
              View vehicles
            </Link>
          </p>
        )}
      </main>
    </div>
  )
}
