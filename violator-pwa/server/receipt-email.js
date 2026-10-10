import { formatDateTime, formatPeso } from '../src/utils/format.js'
import { CONTACT_LINE, renderEmail } from './email-layout.js'

// The MTPB receipt emailed after a payment is recorded. PayMongo sends its
// own payment receipt, but that one has no REF number or violation details,
// and the REF number is what MTPB staff look up. Guests especially need it:
// they have no account to find the receipt in later.

export function buildReceiptEmail(attempt) {
  const email = renderEmail({
    heading: 'OFFICIAL RECEIPT',
    // No test-mode notice (Marco's choice, 2026-10-11): receipts look the same
    // as they would with real payments.
    message:
      'Your payment was received and is waiting for verification by MTPB staff. Once it is verified, an enforcer will remove the clamp.',
    rows: [
      ['Reference Number', attempt.referenceNumber],
      ['Date & Time', formatDateTime(attempt.paidAt)],
      ['Violation Number', attempt.cin],
      ['Plate Number', attempt.plateNo],
      ['Violation Type', attempt.violationType],
      ['Location', attempt.location],
      ['Payment Method', 'GCash'],
      ['Fine Amount', formatPeso(attempt.fineAmount)],
      ['Convenience Fee', formatPeso(attempt.convenienceFee)],
      ['Total Paid', formatPeso(attempt.totalAmount)],
    ],
    emphasizeLast: true,
    closing: [
      'Keep this email. Show the reference number at the MTPB office if you are asked for proof of payment.',
      CONTACT_LINE,
    ],
  })
  return { subject: `MTPB payment received – ${attempt.referenceNumber}`, ...email }
}
