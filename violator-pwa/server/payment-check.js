import { normalizePayment } from '../src/firebase/mapping.js'
import { HttpError } from './payments-service.js'
import { iso } from './violation-access.js'

// The page a phone opens when someone scans a cash payment slip's QR code:
// /r/<payment id> (see cash-payment-qr-spec.md). The QR carries the payment
// record's random id, which can't be guessed, unlike REF numbers that count
// up; so whoever holds the slip may check it. They get just enough to tell a
// genuine slip from a fake one and to match it to the vehicle: no names,
// mobile numbers, emails, OR numbers or staff names.

// Firestore's automatic ids: 20 letters and digits.
const PAYMENT_ID = /^[A-Za-z0-9]{20}$/
const NOT_FOUND = () => new HttpError(404, 'No payment found for this code.')

export function createPaymentCheck({ store }) {
  async function check(paymentId) {
    const id = String(paymentId ?? '').trim()
    if (!PAYMENT_ID.test(id)) throw NOT_FOUND()
    const data = await store.getPaymentById(id)
    if (!data) throw NOT_FOUND()

    const payment = normalizePayment(id, data)
    // Cash payments don't repeat the plate; the violation has it.
    const violation = data.violationId ? await store.getViolationById(data.violationId) : null
    return {
      referenceNumber: payment.referenceNumber,
      method: payment.method,
      amount: payment.amount,
      paidAt: iso(data.paidAt ?? data.createdAt),
      // 'paid' (verified) | 'verifying' | 'rejected' | 'unpaid'
      status: payment.status,
      violationCin: payment.violationCin || violation?.cin || '',
      plateNumber: payment.plateNumber || violation?.plateNumber || '',
    }
  }

  return { check }
}
