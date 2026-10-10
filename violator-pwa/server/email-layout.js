import { SUPPORT_EMAIL } from '../src/data/contact.js'
import { MTPB_LOGO_JPEG_BASE64 } from './assets/mtpb-logo.js'

// The look shared by the app's emails (receipt-email.js, status-email.js):
// the MTPB seal, the bureau's name, a heading, a short message, a table of
// details and closing notes. Returns the plain-text and HTML versions plus
// the seal as an inline attachment.

// The seal travels inside the email and the HTML points at it by this id,
// so it shows without the reader having to load images from a website.
const LOGO_CID = 'mtpb-logo'

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export const CONTACT_LINE = `Questions about your violation? Contact the MTPB office at ${SUPPORT_EMAIL}.`
const FOOTER = 'This email was sent automatically by the MTPB Violator Portal.'

// rows: [label, value] pairs (empty values are left out). `emphasizeLast`
// draws the last row as a red total, like the receipt.
export function renderEmail({ heading, note, message, rows, emphasizeLast = false, closing = [] }) {
  const shown = rows.filter(([, value]) => value)

  const text = [
    'MTPB – Manila Traffic and Parking Bureau',
    heading,
    ...(note ? [note, ''] : ['']),
    message,
    '',
    ...shown.map(([label, value]) => `${label}: ${value}`),
    '',
    ...closing,
    '',
    FOOTER,
  ].join('\n')

  const lastStyle = (i, extra) => (emphasizeLast && i === shown.length - 1 ? `border-top:1px solid #e3e3e6;${extra}` : '')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px 12px;background:#f8f8ff;font-family:Arial,Helvetica,sans-serif;color:#000">
  <div style="max-width:480px;margin:0 auto;background:#fefefe;border:1px solid #434343;border-radius:12px;padding:24px">
    <p style="margin:0 0 8px;text-align:center"><img src="cid:${LOGO_CID}" width="76" height="77" alt="MTPB seal" style="display:inline-block;border:0"></p>
    <p style="margin:0;font-size:24px;font-weight:700;text-align:center">MTPB</p>
    <p style="margin:2px 0 16px;font-size:11px;font-weight:700;text-align:center;letter-spacing:.04em">MANILA TRAFFIC AND PARKING BUREAU</p>
    <p style="margin:0;font-size:14px;font-weight:700;text-align:center">${escapeHtml(heading)}</p>
    ${note ? `<p style="margin:4px 0 0;font-size:11px;color:#676673;text-align:center">${escapeHtml(note)}</p>` : ''}
    <p style="margin:16px 0;font-size:14px;line-height:1.5">${escapeHtml(message)}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
      ${shown
        .map(
          ([label, value], i) => `<tr>
        <td style="padding:7px 0;${lastStyle(i, 'font-weight:700;')}">${escapeHtml(label)}</td>
        <td style="padding:7px 0;text-align:right;font-weight:700;${lastStyle(i, 'color:#f61a28;')}">${escapeHtml(value)}</td>
      </tr>`,
        )
        .join('')}
    </table>
    ${closing.map((line, i) => `<p style="margin:${i ? 8 : 16}px 0 0;font-size:13px;line-height:1.5">${escapeHtml(line)}</p>`).join('\n    ')}
  </div>
  <p style="margin:12px auto 0;max-width:480px;font-size:11px;color:#676673;text-align:center">${FOOTER}</p>
</body></html>`

  const attachments = [
    { filename: 'mtpb-logo.jpg', content: Buffer.from(MTPB_LOGO_JPEG_BASE64, 'base64'), contentType: 'image/jpeg', cid: LOGO_CID },
  ]

  return { text, html, attachments }
}
