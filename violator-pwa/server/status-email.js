import { formatDateTime, formatPeso } from '../src/utils/format.js'
import { CONTACT_LINE, renderEmail } from './email-layout.js'

// Sent when MTPB staff verify or reject a GCash payment made in the app
// (checklist P2), so the payer doesn't have to keep opening the app.
// `decision` is the admin app's word: "Verified" or "Rejected".
export function buildStatusEmail({ decision, attempt, payment }) {
  const verified = decision === 'Verified'
  const reference = payment.referenceNumber || attempt.referenceNumber
  const rows = [
    ['Reference Number', reference],
    ['Violation Number', attempt.cin],
    ['Plate Number', attempt.plateNo],
    ['Amount Paid', formatPeso(attempt.totalAmount)],
    [verified ? 'Verified On' : 'Reviewed On', formatDateTime(payment.verifiedAt)],
    ...(verified ? [] : [['Reason', payment.rejectionReason]]),
  ]

  const email = verified
    ? renderEmail({
        heading: 'PAYMENT VERIFIED',
        message:
          'MTPB staff verified your payment. Your vehicle will now go through MTPB’s release process. If it is clamped, please stay near it and wait for an enforcer to remove the clamp.',
        rows,
        closing: ['Keep this email with your receipt as proof of payment.', CONTACT_LINE],
      })
    : renderEmail({
        heading: 'PAYMENT NOT ACCEPTED',
        message:
          'MTPB staff could not accept your payment, so the violation is unpaid again. The reason is below.',
        rows,
        closing: [
          'You can pay again by scanning the QR code on the clamp and tapping Pay Now, or pay at the MTPB office.',
          'If money was taken from your GCash, bring this email and your reference number to the MTPB office.',
          CONTACT_LINE,
        ],
      })

  const subject = verified ? `MTPB payment verified – ${reference}` : `MTPB payment not accepted – ${reference}`
  return { subject, ...email }
}

// Sent once the release officer marks the vehicle released (Mira's
// markViolationAsReleased: releaseStatus "Released", releaseOrderId,
// releasedAt). `violation` is that violation document with its id.
export function buildReleaseEmail({ attempt, violation }) {
  const reference = attempt.referenceNumber
  const email = renderEmail({
    heading: 'VEHICLE RELEASED',
    message:
      'MTPB has released your vehicle. Thank you for settling your violation. Keep this email with your receipt in case you are asked for proof of release.',
    rows: [
      ['Release Order No.', violation.releaseOrderId],
      ['Violation Number', violation.cin || attempt.cin],
      ['Plate Number', violation.plateNo || attempt.plateNo],
      ['Payment Reference', reference],
      ['Released On', formatDateTime(violation.releasedAt)],
    ],
    closing: [CONTACT_LINE],
  })
  return { subject: `MTPB vehicle released – ${violation.cin || attempt.cin}`, ...email }
}
