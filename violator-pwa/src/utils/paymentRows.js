import { formatPeso } from './format'

// Fine / convenience fee lines shown above the total on the success screen
// and the receipt. Older demo payments without a breakdown show nothing.
// The receipt card keeps the English labels; the success screen passes the
// chosen language's.
export function breakdownRows(payment, labels = { fine: 'Fine Amount', fee: 'Convenience Fee' }) {
  if (payment?.fineAmount == null || !payment?.convenienceFee) return []
  return [
    [labels.fine, formatPeso(payment.fineAmount)],
    [labels.fee, formatPeso(payment.convenienceFee)],
  ]
}
