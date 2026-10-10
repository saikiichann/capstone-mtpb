import { useT } from '../i18n/language-context'

// Small outlined labels from Violation History / Violation Details 2.
// IMPOUNDED and UNPAID use the red style, CLAMPED the orange one.
// PAID isn't in the design; it uses the green of the success screen.
const TONES = {
  impounded: 'danger',
  unpaid: 'danger',
  clamped: 'warning',
  paid: 'success',
  // Paid, waiting for MTPB staff to verify it.
  verifying: 'warning',
  // Vehicle verification (My Vehicles)
  active: 'success',
  pending: 'warning',
  rejected: 'danger',
  // Payment states (Payment History)
  failed: 'danger',
  expired: 'danger',
  cancelled: 'danger',
  duplicate: 'warning',
  review: 'warning',
  // Saved wallets (Payment Settings)
  default: 'success',
  saved: 'neutral',
}

// The violation and payment words have English and Filipino labels
// (src/i18n/strings.js); "verifying" also reads better as a phrase. The
// rest show the status word itself.
const TRANSLATED = ['unpaid', 'paid', 'verifying', 'clamped', 'impounded']

export default function StatusBadge({ status, className = '' }) {
  const t = useT()
  if (!status) return null
  const tone = TONES[status] ?? 'neutral'
  const label = TRANSLATED.includes(status) ? t(`status.${status}`) : status
  return <span className={`status-badge status-badge--${tone} ${className}`.trim()}>{label}</span>
}
