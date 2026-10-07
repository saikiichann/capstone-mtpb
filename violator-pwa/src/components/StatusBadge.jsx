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

// Shown instead of the status word where the word alone would be unclear.
const LABELS = {
  verifying: 'paid – awaiting verification',
}

export default function StatusBadge({ status, className = '' }) {
  if (!status) return null
  const tone = TONES[status] ?? 'neutral'
  return <span className={`status-badge status-badge--${tone} ${className}`.trim()}>{LABELS[status] ?? status}</span>
}
