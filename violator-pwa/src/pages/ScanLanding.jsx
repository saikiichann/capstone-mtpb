import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import LanguageToggle from '../components/LanguageToggle'
import PageHeader from '../components/PageHeader'
import { CLAMP_STATUS } from '../firebase/clamps'
import useClamp from '../hooks/useClamp'
import { useT } from '../i18n/language-context'

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
  const t = useT()
  const { status, clamp } = useClamp(qrId, user?.uid)

  if (status === 'loading') {
    return (
      <ScanShell>
        <div className="card state-card" role="status">
          <p>{t('scan.loading')}</p>
        </div>
      </ScanShell>
    )
  }

  if (status === 'error') {
    return (
      <ScanShell>
        <div className="card state-card" role="alert">
          <h2 className="screen-title">{t('common.somethingWrong')}</h2>
          <p>{t('scan.error')}</p>
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
        <h2 className="screen-title">{t(`${message}.title`)}</h2>
        <p>{t(`${message}.1`)}</p>
        <p>{t(`${message}.2`)}</p>
        {/* The clamp's printed number is what a violator can check against
            the clamp on their wheel and quote at the office. The scanned
            code is the admin app's secret token, so it isn't shown. */}
        {clamp.clampNumber && (
          <p className="scan-landing__clamp">
            {t('scan.clamp')} <strong>{clamp.clampNumber}</strong>
          </p>
        )}
      </div>
    </ScanShell>
  )
}

// Keys in src/i18n/strings.js: `<key>.title`, `<key>.1`, `<key>.2`.
const MESSAGES = {
  [CLAMP_STATUS.waiting]: 'scan.waiting',
  [CLAMP_STATUS.released]: 'scan.released',
  'not-found': 'scan.notFound',
  unknown: 'scan.unknown',
}

function ScanShell({ children }) {
  const t = useT()
  return (
    <div className="page">
      <PageHeader title={t('scan.title')} action={<LanguageToggle />} />
      <main className="page__body scan-landing">{children}</main>
    </div>
  )
}
