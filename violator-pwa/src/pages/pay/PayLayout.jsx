import { Navigate, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import PageHeader from '../../components/PageHeader'
import ViolationStates from '../../components/ViolationStates'
import useViolation from '../../hooks/useViolation'
import { useT } from '../../i18n/language-context'

// Wraps the three "Pay Now" steps. Loads the violation once, sends paid ones
// back to the violation (a cash payment has no receipt in the app), and
// passes the violation down through the Outlet.
export default function PayLayout() {
  const { violationRef } = useParams()
  const { user } = useAuth()
  const t = useT()
  const { status, violation } = useViolation(violationRef, user.uid)

  if (status === 'ready' && violation.paymentStatus === 'paid') {
    return <Navigate to={`/v/${encodeURIComponent(violationRef)}`} replace />
  }

  if (status !== 'ready') {
    return (
      <div className="page">
        <PageHeader title={t('pay.title')} back />
        <main className="page__body">
          <ViolationStates status={status} cin={violationRef} />
        </main>
      </div>
    )
  }

  return <Outlet context={{ violation }} />
}
