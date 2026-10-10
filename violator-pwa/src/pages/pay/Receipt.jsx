import { toBlob } from 'html-to-image'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import mtpbLogo from '../../assets/mtpb-logo.webp'
import { useAuth } from '../../auth/auth-context'
import Modal from '../../components/Modal'
import OptionalAsset from '../../components/OptionalAsset'
import PageHeader from '../../components/PageHeader'
import usePayment from '../../hooks/usePayment'
import { isTestPayment } from '../../payments'
import { formatDateTime, formatPeso } from '../../utils/format'
import { breakdownRows } from '../../utils/paymentRows'
import { ProcessingPayment } from './PayConfirm'

// Figma "RECEIPT" + "RECEIPT OVERLAY".
// The download button saves the receipt card as a PNG with a plain download:
// it lands in Downloads and the gallery on Android (the only phones this app
// supports). No share sheet — Android's often has no "save" option at all.

// Waits for the images on the card (the MTPB logo) to finish loading first:
// a snapshot taken before that leaves an empty space where the logo goes.
async function renderReceipt(node) {
  await Promise.all(
    [...node.querySelectorAll('img')].map((img) => (img.decode ? img.decode().catch(() => {}) : null)),
  )
  return toBlob(node, {
    pixelRatio: 3,
    backgroundColor: '#fefefe',
    // The shadow gets clipped at the edges, so leave it out of the image.
    style: { boxShadow: 'none', margin: '0' },
  })
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}


function violationPath(payment) {
  const ref = payment.violationId || payment.violationCin
  return ref ? `/v/${encodeURIComponent(ref)}` : '/violations'
}

export default function Receipt() {
  const { reference } = useParams()
  const { user } = useAuth()
  // Payment History passes `from` so back returns there; elsewhere back
  // goes to Violation History as before.
  const backTo = useLocation().state?.from ?? '/violations'
  const isGuest = Boolean(user?.isGuest)
  const { status, payment } = usePayment(user.uid, reference)
  const cardRef = useRef(null)
  // The image is made as soon as the receipt is on screen. Building it takes
  // a few seconds on a phone, and doing that after the tap can make the
  // browser stop treating the download as something the owner asked for.
  const prepared = useRef(null) // Promise<Blob>
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null) // { text, ok }
  const ready = status === 'ready' && payment?.isPaid
  const receiptKey = ready ? `${payment.referenceNumber}|${payment.status}` : ''

  useEffect(() => {
    prepared.current = null
    if (!receiptKey) return undefined
    let cancelled = false
    // Wait for the web fonts, or the image comes out in a fallback font.
    const timer = setTimeout(async () => {
      await document.fonts?.ready
      if (cancelled || !cardRef.current) return
      prepared.current = renderReceipt(cardRef.current).catch(() => null)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [receiptKey])

  if (status === 'loading') return <ProcessingPayment lines={['Loading your receipt...', 'Please wait.']} />
  if (status !== 'ready') return <Navigate to="/violations" replace />
  // Only a paid payment has a receipt. Anything else goes back to the
  // violation, which still shows UNPAID and Pay Now.
  if (!payment.isPaid) return <Navigate to={violationPath(payment)} replace />

  async function handleDownload() {
    if (saving || !cardRef.current) return
    setSaving(true)
    try {
      const blob = (await prepared.current) ?? (await renderReceipt(cardRef.current))
      if (!blob) throw new Error('The receipt image came out empty')
      downloadBlob(blob, `MTPB-receipt-${payment.referenceNumber}.png`)
      setNotice({ text: 'Receipt saved to your Downloads.', ok: true })
    } catch (err) {
      console.error('Could not save receipt', err)
      setNotice({ text: 'The receipt couldn’t be saved. Please try again.', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const rows = [
    ['Reference Number', payment.referenceNumber],
    ['Date & Time', formatDateTime(payment.paidAt, { short: true })],
    // The CIN is the code on the clamp; the violation ID is the record MTPB
    // staff look up if someone queries this payment at the office.
    ['Violation Number', payment.violationCin],
    ...(payment.violationId && payment.violationId !== payment.violationCin
      ? [['Violation ID', payment.violationId]]
      : []),
    ['Plate Number', payment.plateNumber],
    ['Violation Type', payment.violationType],
    ['Location', payment.location],
    ['Officer', payment.officerName],
    ...breakdownRows(payment),
  ]

  return (
    <div className="page">
      <PageHeader
        title="Receipt"
        back={isGuest ? `/v/${encodeURIComponent(payment.violationId || payment.violationCin || '')}` : backTo}
        action={
          <button
            type="button"
            className="header-icon-btn"
            onClick={handleDownload}
            disabled={saving}
            aria-label="Save receipt as image"
          >
            <OptionalAsset
              name="download"
              width={20}
              height={20}
              fallback={<span className="header-icon-btn__glyph" aria-hidden="true">⤓</span>}
            />
          </button>
        }
      />

      <main className="page__body receipt-body">
        <section ref={cardRef} className="card receipt-card" aria-label="Receipt">
          <img className="receipt-card__logo" src={mtpbLogo} width={76} height={77} alt="MTPB seal" />
          <p className="receipt-card__org">MTPB</p>
          <p className="receipt-card__org-full">Manila Traffic and Parking Bureau</p>
          <h2 className="receipt-card__title">Official Receipt</h2>
          {payment.awaitingVerification && (
            <p className="receipt-card__sandbox">Payment received – awaiting verification by MTPB staff</p>
          )}
          {isTestPayment(payment) && (
            <p className="receipt-card__sandbox">Sandbox transaction – not valid as an official receipt</p>
          )}

          <dl className="receipt-list">
            {rows.map(([label, value]) => (
              <div className="receipt-list__row" key={label}>
                <dt>{label}</dt>
                <dd>{value || '—'}</dd>
              </div>
            ))}
          </dl>

          <hr className="receipt-card__divider" />
          <div className="receipt-card__total">
            <span>Total Paid</span>
            <strong>{formatPeso(payment.amount)}</strong>
          </div>
        </section>

        {isGuest && (
          <div className="info-note receipt-body__guest">
            <p>
              <strong>Save this receipt now.</strong> You paid as a guest, so this receipt is only here while
              this page is open. Once you close it you can’t open it again — you’d have to ask for a copy at the
              MTPB office.
            </p>
            {payment.email ? (
              <p>GCash also sends a copy to {payment.email}.</p>
            ) : (
              <p>Your GCash app also keeps a record of the payment.</p>
            )}
          </div>
        )}

        {isGuest && (
          <div className="receipt-body__guest-actions">
            <button type="button" className="btn btn--pay btn--primary" onClick={handleDownload} disabled={saving}>
              {saving ? 'Saving…' : 'Download receipt'}
            </button>
            <Link className="text-button" to="/signup" state={{ returnTo: `/receipts/${reference}` }}>
              Create an account to keep your receipts
            </Link>
          </div>
        )}

        <p className="receipt-body__thanks">
          <strong>Thank you for your payment.</strong>
          <br />
          Please drive responsibly.
        </p>
      </main>

      <Modal open={Boolean(notice)} onClose={() => setNotice(null)} labelledBy="receipt-notice" className="notice-modal">
        <p id="receipt-notice" className="notice-modal__text">
          {notice?.text}
        </p>
        <button type="button" className="btn btn--primary notice-modal__ok" onClick={() => setNotice(null)}>
          Okay
        </button>
      </Modal>
    </div>
  )
}
