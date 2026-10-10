import { SUPPORT_EMAIL } from '../src/data/contact.js'
import { formatDateTime, formatPeso } from '../src/utils/format.js'
import { MTPB_LOGO_JPEG_BASE64 } from './assets/mtpb-logo.js'

// The seal travels inside the email and the HTML points at it by this id,
// so it shows without the reader having to load images from a website.
const LOGO_CID = 'mtpb-logo'

// The MTPB receipt emailed after a payment is recorded. PayMongo sends its
// own payment receipt, but that one has no REF number or violation details,
// and the REF number is what MTPB staff look up. Guests especially need it:
// they have no account to find the receipt in later.

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function buildReceiptEmail(attempt) {
  const rows = [
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
  ].filter(([, value]) => value)

  // Test-mode payments say so, like the receipt page does.
  const sandbox = attempt.livemode === false
  const subject = `MTPB payment received – ${attempt.referenceNumber}`
  const status =
    'Your payment was received and is waiting for verification by MTPB staff. Once it is verified, an enforcer will remove the clamp.'
  const keep = 'Keep this email. Show the reference number at the MTPB office if you are asked for proof of payment.'
  const contact = `Questions about your violation? Contact the MTPB office at ${SUPPORT_EMAIL}.`

  const text = [
    'MTPB – Manila Traffic and Parking Bureau',
    'OFFICIAL RECEIPT',
    ...(sandbox ? ['Sandbox transaction – not valid as an official receipt', ''] : ['']),
    status,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    keep,
    contact,
    '',
    'This email was sent automatically by the MTPB Violator Portal.',
  ].join('\n')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px 12px;background:#f8f8ff;font-family:Arial,Helvetica,sans-serif;color:#000">
  <div style="max-width:480px;margin:0 auto;background:#fefefe;border:1px solid #434343;border-radius:12px;padding:24px">
    <p style="margin:0 0 8px;text-align:center"><img src="cid:${LOGO_CID}" width="76" height="77" alt="MTPB seal" style="display:inline-block;border:0"></p>
    <p style="margin:0;font-size:24px;font-weight:700;text-align:center">MTPB</p>
    <p style="margin:2px 0 16px;font-size:11px;font-weight:700;text-align:center;letter-spacing:.04em">MANILA TRAFFIC AND PARKING BUREAU</p>
    <p style="margin:0;font-size:14px;font-weight:700;text-align:center">OFFICIAL RECEIPT</p>
    ${sandbox ? '<p style="margin:4px 0 0;font-size:11px;color:#676673;text-align:center">Sandbox transaction – not valid as an official receipt</p>' : ''}
    <p style="margin:16px 0;font-size:14px;line-height:1.5">${escapeHtml(status)}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows
        .map(
          ([label, value], i) => `<tr>
        <td style="padding:7px 0;${i === rows.length - 1 ? 'border-top:1px solid #e3e3e6;font-weight:700;' : ''}">${escapeHtml(label)}</td>
        <td style="padding:7px 0;text-align:right;font-weight:700;${i === rows.length - 1 ? 'border-top:1px solid #e3e3e6;color:#f61a28;' : ''}">${escapeHtml(value)}</td>
      </tr>`,
        )
        .join('')}
    </table>
    <p style="margin:16px 0 0;font-size:13px;line-height:1.5">${escapeHtml(keep)}</p>
    <p style="margin:8px 0 0;font-size:13px;line-height:1.5">${escapeHtml(contact)}</p>
  </div>
  <p style="margin:12px auto 0;max-width:480px;font-size:11px;color:#676673;text-align:center">This email was sent automatically by the MTPB Violator Portal.</p>
</body></html>`

  const attachments = [
    { filename: 'mtpb-logo.jpg', content: Buffer.from(MTPB_LOGO_JPEG_BASE64, 'base64'), contentType: 'image/jpeg', cid: LOGO_CID },
  ]

  return { subject, text, html, attachments }
}
