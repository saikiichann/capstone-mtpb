import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import PageHeader from '../components/PageHeader'
import { CLAMP_STATUS } from '../firebase/clamps'
import useClamp from '../hooks/useClamp'

// Where a scanned QR sticker lands: /q/<scan token> (via /scan?t=…). The
// token belongs to the clamp and is reused for its next violation, so this
// screen reads the clamp's state and opens the violation that is live on it
// right now:
//   for_payment  → the violation, where they can pay (guest or account)
//   paid / ready_for_release → the violation, which shows PAID
//   waiting      → nothing recorded on this clamp yet
//   released     → the clamp is free again
export default function ScanLanding() {
  const { qrId } = useParams()
  const { user } = useAuth()
  const { status, clamp } = useClamp(qrId, user?.uid)

  if (status === 'loading') {
    return (
      <ScanShell>
        <div className="card state-card" role="status">
          <p>Reading the clamp’s code…</p>
        </div>
      </ScanShell>
    )
  }

  if (status === 'error') {
    return (
      <ScanShell>
        <div className="card state-card" role="alert">
          <h2 className="screen-title">Something went wrong</h2>
          <p>We couldn’t read this clamp’s code. Check your connection and scan again.</p>
        </div>
      </ScanShell>
    )
  }

  // There is a violation on this clamp: open that exact record. The QR id
  // repeats across violations, so the link uses the violation's own id.
  if (clamp.violation) {
    return <Navigate to={`/v/${encodeURIComponent(clamp.violation.id ?? clamp.violation.cin)}`} replace />
  }

  const message = MESSAGES[clamp.found ? clamp.status : 'not-found'] ?? MESSAGES.unknown

  return (
    <ScanShell>
      <div className="card state-card">
        <h2 className="screen-title">{message.title}</h2>
        {message.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {/* The clamp's printed number is what a violator can check against
            the clamp on their wheel and quote at the office. The scanned
            code is the admin app's secret token, so it isn't shown. */}
        {clamp.clampNumber && (
          <p className="scan-landing__clamp">
            Clamp <strong>{clamp.clampNumber}</strong>
          </p>
        )}
      </div>
    </ScanShell>
  )
}

const MESSAGES = {
  [CLAMP_STATUS.waiting]: {
    title: 'Nothing to pay on this clamp',
    lines: [
      'No violation has been recorded on this clamp yet.',
      'If an enforcer just clamped your vehicle, give them a moment to finish and scan again.',
    ],
  },
  [CLAMP_STATUS.released]: {
    title: 'This clamp has been released',
    lines: [
      'The violation on this clamp is settled and the clamp has been removed.',
      'If your vehicle is still clamped, please contact the MTPB office.',
    ],
  },
  'not-found': {
    title: 'Clamp not found',
    lines: [
      'This code isn’t registered with MTPB.',
      'Check that you scanned the sticker on the clamp, or contact the MTPB office.',
    ],
  },
  unknown: {
    title: 'Clamp not ready',
    lines: [
      'This clamp has no violation you can pay right now.',
      'Please contact the MTPB office if your vehicle is clamped.',
    ],
  },
}

function ScanShell({ children }) {
  return (
    <div className="page">
      <PageHeader title="Scanned Clamp" />
      <main className="page__body scan-landing">{children}</main>
    </div>
  )
}
