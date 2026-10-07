import { samplePayments } from '../data/sample'
import { shouldUseSampleData } from '../firebase/config'
import { computeCharges } from './fees'

// DEMO PAYMENTS (used when VITE_PAYMENTS_MODE isn't "paymongo").
// No PayMongo or GCash connection: a "payment" waits a moment, makes a
// reference number and is saved on this device only (localStorage), so the
// screens can be clicked through without a backend.
// The real PayMongo test-mode flow lives in ./index.js and the api/ folder.

const STORAGE_KEY = 'mtpb-sandbox-payments'
const PROCESSING_MS = 2500

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage unavailable (private mode or full): the payment still shows on
    // the success screen, but won't be remembered after a refresh.
  }
}

// Every payment made by this owner on this device, newest first.
export function getPayments(uid) {
  const saved = readAll()[uid] ?? []
  const seeded = shouldUseSampleData ? samplePayments : []
  return [...saved, ...seeded]
    .map((p) => ({ status: 'paid', ...p })) // demo payments made before `status` existed
    .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
}

export function getPaymentByReference(uid, referenceNumber) {
  return getPayments(uid).find((p) => p.referenceNumber === referenceNumber) ?? null
}

export function getPaymentForViolation(uid, cin) {
  return getPayments(uid).find((p) => p.violationCin === cin) ?? null
}

// Marks a violation as paid if this owner has a demo payment for it.
export function withPaymentStatus(uid, violation) {
  if (!violation || !uid) return violation
  const payment = getPaymentForViolation(uid, violation.cin)
  return payment ? { ...violation, paymentStatus: 'paid', referenceNumber: payment.referenceNumber } : violation
}

// Looks like REF-2026-00123. The real backend uses a counter; for the demo
// the last digits of the current time are close enough.
function makeReferenceNumber(date) {
  const serial = String(date.getTime() % 100000).padStart(5, '0')
  return `REF-${date.getFullYear()}-${serial}`
}

export async function submitSandboxPayment({ uid, violation, method, mobileNumber, email }) {
  await new Promise((resolve) => setTimeout(resolve, PROCESSING_MS))

  const existing = getPaymentForViolation(uid, violation.cin)
  if (existing) return existing // never charge the same violation twice

  const now = new Date()
  const charges = computeCharges(violation.fineAmount, method)
  const payment = {
    referenceNumber: makeReferenceNumber(now),
    status: 'paid',
    violationCin: violation.cin,
    plateNumber: violation.plateNumber,
    violationType: violation.violationType,
    location: violation.location,
    officerName: violation.officerName,
    fineAmount: charges.fine,
    convenienceFee: charges.fee,
    amount: charges.total,
    method,
    mobileNumber,
    email: email || '',
    paidAt: now.toISOString(),
    sandbox: true,
  }

  const all = readAll()
  all[uid] = [payment, ...(all[uid] ?? [])]
  writeAll(all)
  return payment
}
