// Formatting helpers shared across screens.

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Matches the Figma style "₱ 900.00" (peso sign, space, two decimals).
export function formatPeso(amount) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return '—'
  return `₱ ${pesoFormatter.format(amount)}`
}

// Accepts an ISO string, Date, or Firestore Timestamp.
// Output matches the Figma style "April 29, 2026 - 09:15 AM".
// { short: true } gives "Sep 17, 2026 - 09:06 PM" for narrow rows.
export function formatDateTime(value, { short = false } = {}) {
  if (!value) return ''
  const date =
    typeof value?.toDate === 'function' ? value.toDate() : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const datePart = date.toLocaleDateString('en-US', {
    month: short ? 'short' : 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  })
  const timePart = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  })
  return `${datePart} - ${timePart}`
}

// Milliseconds from an ISO string, Date or Firestore Timestamp (0 if empty).
export function toMillis(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  return new Date(value).getTime() || 0
}
