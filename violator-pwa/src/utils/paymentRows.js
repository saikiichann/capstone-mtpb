import { formatPeso } from './format'

// Fine / convenience fee lines shown above the total on the success screen
// and the receipt. Older demo payments without a breakdown show nothing.
export function breakdownRows(payment) {
  if (payment?.fineAmount == null || !payment?.convenienceFee) return []
  return [
    ['Fine Amount', formatPeso(payment.fineAmount)],
    ['Convenience Fee', formatPeso(payment.convenienceFee)],
  ]
}
