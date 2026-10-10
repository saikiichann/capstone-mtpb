import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore'
import { callApi } from '../api'
import { db, isFirebaseConfigured } from '../firebase/config'
import { normalizePayment } from '../firebase/mapping'
import { scanTokenFor } from '../firebase/scan-tokens'
import { getViolation } from '../firebase/violations'
import { COLLECTIONS } from '../firebase/schema'
import { METHOD_FEES } from './fees'
import * as demo from './sandbox'

// What the payment screens call. Two modes:
// - "paymongo": real PayMongo test mode through the Vercel backend (api/).
//   Turn on with VITE_PAYMENTS_MODE=paymongo (needs Firebase configured).
// - "demo": simulated on this device only (./sandbox.js). The default.

export const paymentsMode =
  import.meta.env.VITE_PAYMENTS_MODE === 'paymongo' && isFirebaseConfigured ? 'paymongo' : 'demo'

export const PAYMENT_METHODS = Object.fromEntries(
  Object.entries(METHOD_FEES).map(([id, m]) => [id, { id, label: m.label }]),
)

// Step 3 "Confirm Payment".
// Returns { paymentId, redirectUrl? }. With redirectUrl, send the browser
// there (PayMongo's GCash test page). paymentId goes in the success page's
// address: the checkout attempt with PayMongo (no REF number exists until
// the payment goes through), the reference number in demo mode.
export async function startPayment({ uid, violation, method, mobileNumber, email }) {
  if (paymentsMode === 'demo') {
    const payment = await demo.submitSandboxPayment({ uid, violation, method, mobileNumber, email })
    return { paymentId: payment.referenceNumber }
  }
  // The QR id repeats across violations, so the backend is told exactly
  // which record this is.
  const data = await callApi('create-checkout', {
    violationId: violation.id,
    cin: violation.cin,
    method,
    mobileNumber,
    email,
    // A guest may only pay a violation whose clamp they scanned.
    token: scanTokenFor(violation.id) ?? scanTokenFor(violation.cin),
  })
  return { paymentId: data.attemptId, redirectUrl: data.checkoutUrl }
}

// The success page's question: did the payment go through? With PayMongo
// the backend checks and, once paid, records it in the admin app and says
// which REF number it got. The browser can't read checkout attempts itself.
// Returns { status: 'paid' | 'pending' | 'duplicate' | 'review' | 'failed' | 'missing', payment }.
export async function checkPayment(uid, paymentId) {
  if (paymentsMode === 'demo') {
    const found = demo.getPaymentByReference(uid, paymentId)
    return found ? { status: 'paid', payment: normalizePayment(paymentId, found) } : { status: 'missing', payment: null }
  }
  let data
  try {
    data = await callApi('confirm-payment', { attemptId: paymentId })
  } catch (err) {
    if (err?.status === 404) return { status: 'missing', payment: null }
    throw err
  }
  const view = data.payment ?? {}
  const payment = normalizePayment(paymentId, {
    ...view,
    // Recorded in the admin app as waiting for verification.
    status: data.status === 'paid' ? 'pending' : 'unpaid',
  })
  const known = ['paid', 'pending', 'duplicate', 'review']
  return { status: known.includes(data.status) ? data.status : 'failed', payment }
}

// Every payment this owner has started, newest first (Payment History).
export async function listPayments(uid) {
  // Demo payments go through the same shape, so the screens only ever see
  // one kind of payment object.
  if (paymentsMode === 'demo') return demo.getPayments(uid).map((p) => normalizePayment(p.referenceNumber, p))

  const snapshot = await getDocs(query(collection(db, COLLECTIONS.payments), where('uid', '==', uid)))
  if (snapshot.docs[0]) reportShape(snapshot.docs[0])
  // Sorted here so Firestore doesn't need a composite index.
  return snapshot.docs
    .map((d) => normalizePayment(d.id, d.data()))
    .sort((a, b) => paymentTime(b) - paymentTime(a))
}

// Prints one payment document's real field names and its status once per
// session. Opening devtools on the deployed app is then enough to see what
// the shared database actually stores, without needing console access to it.
let shapeReported = false
function reportShape(snapshot) {
  if (shapeReported) return
  shapeReported = true
  const data = snapshot.data()
  console.info(
    '[MTPB] payment %s fields: %s | status: %o | paymentStatus: %o',
    snapshot.id,
    Object.keys(data).join(', '),
    data.status,
    data.paymentStatus,
  )
}

function paymentTime(payment) {
  const value = payment.paidAt ?? payment.createdAt
  if (!value) return 0
  return typeof value?.toDate === 'function' ? value.toDate().getTime() : new Date(value).getTime()
}

// The admin app's payment record doesn't repeat the violation's details,
// so the receipt fills them in from the violation itself.
const violationDetails = new Map()
async function withViolationDetails(payment) {
  if (!payment?.violationId || (payment.violationType && payment.location && payment.officerName)) return payment
  if (!violationDetails.has(payment.violationId)) {
    violationDetails.set(
      payment.violationId,
      // Through the server: the payer may still see the violation they paid.
      getViolation(payment.violationId).catch(() => null),
    )
  }
  const violation = await violationDetails.get(payment.violationId)
  if (!violation) return payment
  return {
    ...payment,
    violationType: payment.violationType || violation.violationType,
    location: payment.location || violation.location,
    officerName: payment.officerName || violation.officerName,
  }
}

// Calls onChange(payment | null) now and whenever the payment changes.
// Returns an unsubscribe function. Payments are found by REF number: the
// admin app gives its payment documents random ids.
export function subscribeToPayment(uid, referenceNumber, onChange, onError) {
  if (paymentsMode === 'demo') {
    const found = demo.getPaymentByReference(uid, referenceNumber)
    onChange(found ? normalizePayment(referenceNumber, found) : null)
    return () => {}
  }
  let active = true
  const unsubscribe = onSnapshot(
    query(
      collection(db, COLLECTIONS.payments),
      where('uid', '==', uid),
      where('referenceNumber', '==', referenceNumber),
    ),
    (snapshot) => {
      const found = snapshot.docs[0]
      if (!found) return onChange(null)
      reportShape(found)
      withViolationDetails(normalizePayment(found.id, found.data())).then((payment) => {
        if (active) onChange(payment)
      })
    },
    (err) => {
      // A reference that doesn't exist (or isn't yours) is refused by the
      // security rules, which is the same as "not found" for the screens.
      if (err?.code === 'permission-denied') onChange(null)
      else onError?.(err)
    },
  )
  return () => {
    active = false
    unsubscribe()
  }
}

// In demo mode, paid status lives on this device; with PayMongo the backend
// writes it onto the violation itself.
export function withLocalPaymentStatus(uid, violation) {
  return paymentsMode === 'demo' ? demo.withPaymentStatus(uid, violation) : violation
}

// Test-mode / demo payments get the "not valid as an official receipt" note.
export function isTestPayment(payment) {
  return Boolean(payment?.sandbox) || payment?.livemode === false
}
