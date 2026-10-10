import { config } from '../server/config.js'
import { adminAuth, createFirestoreStore } from '../server/firestore-store.js'
import {
  corsHeaders,
  enforceRateLimit,
  errorResponse,
  json,
  preflight,
  readJson,
  requireUser,
  trustedOrigin,
} from '../server/http.js'
import { paymongo } from '../server/paymongo.js'
import { createPaymentService } from '../server/payments-service.js'
import { createRateLimiter } from '../server/rate-limit.js'
import { createViolationAccess } from '../server/violation-access.js'

// At most 10 payment starts a minute from one network address (checklist
// S4). The per-person limit is in payments-service.js.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 })

// POST /api/create-checkout
// Body: { violationId, cin, method: 'gcash', mobileNumber, email }
// violationId is the violation's own document id; cin (the clamp's QR id)
// is accepted as a fallback.
// (plus `token`, the scanned QR sticker's scan token, for guests)
// Header: Authorization: Bearer <Firebase ID token>
// Returns: { attemptId, checkoutUrl }. The REF number is only given out once
// PayMongo confirms the payment (see /api/confirm-payment).

export function OPTIONS(request) {
  return preflight(request)
}

export async function POST(request) {
  const headers = corsHeaders(request)
  try {
    enforceRateLimit(limiter, request)
    const user = await requireUser(request, adminAuth())
    const body = await readJson(request)
    const store = createFirestoreStore()
    // Only for a violation this person may see (scanned its clamp, owns the
    // vehicle, or already paying it): server/violation-access.js.
    const violation = await createViolationAccess({ store }).getViolation({
      user,
      ref: body.violationId || body.cin,
      token: body.token,
    })
    const service = createPaymentService({ store, paymongo })
    const result = await service.startCheckout({
      uid: user.uid,
      violationId: violation.id,
      cin: violation.cin,
      method: body.method,
      mobileNumber: body.mobileNumber,
      email: body.email,
      // Send people back to the site they paid from (the deployed app, or
      // localhost while testing if it's listed in ALLOWED_ORIGINS).
      returnOrigin: trustedOrigin(request) || config.appUrl,
    })
    return json(200, result, headers)
  } catch (err) {
    return errorResponse(err, headers)
  }
}
