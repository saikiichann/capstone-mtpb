import { adminAuth, createFirestoreStore } from '../server/firestore-store.js'
import { corsHeaders, enforceRateLimit, errorResponse, json, preflight, readJson, requireUser } from '../server/http.js'
import { createPaymentCheck } from '../server/payment-check.js'
import { createRateLimiter } from '../server/rate-limit.js'

// POST /api/payment-check
// Header: Authorization: Bearer <Firebase ID token> (guests: anonymous)
// Body: { id }  the payment id from a cash slip's QR (/r/<id>)
// Returns: { payment: { referenceNumber, method, amount, paidAt, status, violationCin, plateNumber } }
//          or 404 "No payment found for this code."
// See server/payment-check.js.

// Plenty for checking a slip or two, tight for anyone trying codes.
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 })

export function OPTIONS(request) {
  return preflight(request)
}

export async function POST(request) {
  const headers = corsHeaders(request)
  try {
    enforceRateLimit(limiter, request)
    await requireUser(request, adminAuth())
    const body = await readJson(request)
    const payment = await createPaymentCheck({ store: createFirestoreStore() }).check(body.id)
    return json(200, { payment }, headers)
  } catch (err) {
    return errorResponse(err, headers)
  }
}
