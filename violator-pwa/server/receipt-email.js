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
      [attempt.chargeType === 'Impound' ? 'Impound Fee' : 'Fine Amount', formatPeso(attempt.fineAmount)],
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

// Sent to the account's registered email when someone adds a cash payment
// from its slip's QR (server/account-links.js). Cash can only be added once
// MTPB has verified it, so this one says verified. `payment` is Mira's
// payment document; `violation` the mapped violation, for its details.
export function buildCashReceiptEmail({ payment, violation }) {
  const total = payment.totalAmount ?? payment.amount
  const email = renderEmail({
    heading: 'PAYMENT RECEIPT',
    message:
      'Your cash payment is verified by MTPB and is now in your MTPB account, where you can also open this receipt.',
    rows: [
      ['Reference Number', payment.referenceNumber],
      ['OR Number', payment.orNumber],
      ['Date Paid', formatDateTime(payment.paidAt ?? payment.createdAt)],
      ['Violation Number', payment.cin || violation?.cin],
      ['Plate Number', payment.plateNo || violation?.plateNumber],
      ['Violation Type', violation?.violationType],
      ['Location', violation?.location],
      ['Payment Method', 'Cash'],
      ['Status', 'Verified'],
      ['Total Paid', formatPeso(total)],
    ],
    emphasizeLast: true,
    closing: [
      'Keep this email with your printed slip. Show the reference number at the MTPB office if you are asked for proof of payment.',
      CONTACT_LINE,
    ],
  })
  return { subject: `MTPB cash payment receipt – ${payment.referenceNumber}`, ...email }
}
