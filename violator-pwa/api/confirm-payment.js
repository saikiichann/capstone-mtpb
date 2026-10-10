import { adminAuth, createFirestoreStore } from '../server/firestore-store.js'
import { corsHeaders, enforceRateLimit, errorResponse, json, preflight, readJson, requireUser } from '../server/http.js'
import { createMailer } from '../server/mailer.js'
import { paymongo } from '../server/paymongo.js'
import { createPaymentService } from '../server/payments-service.js'
import { createRateLimiter } from '../server/rate-limit.js'

// At most 40 checks a minute from one network address (checklist S4). The
// success page checks about every 4 seconds while it waits, so this leaves
// plenty of room for several people paying from the same Wi-Fi.
const limiter = createRateLimiter({ limit: 40, windowMs: 60_000 })

// POST /api/confirm-payment
// Body: { attemptId }
// Asks PayMongo directly whether the payment went through. The success page
// calls this in case the webhook hasn't arrived yet, and to get the REF
// number and payment details (the browser can't read checkout attempts).
// Returns: { status: 'pending' | 'paid' | 'duplicate' | 'expired' | 'failed' | 'review',
//            payment: { attemptId, referenceNumber, cin, totalAmount, ... } }

export function OPTIONS(request) {
  return preflight(request)
}

export async function POST(request) {
  const headers = corsHeaders(request)
  try {
    enforceRateLimit(limiter, request)
    const user = await requireUser(request, adminAuth())
    const body = await readJson(request)
    const service = createPaymentService({ store: createFirestoreStore(), paymongo, mailer: createMailer() })
    const result = await service.confirm({ uid: user.uid, attemptId: body.attemptId })
    return json(200, result, headers)
  } catch (err) {
    return errorResponse(err, headers)
  }
}
