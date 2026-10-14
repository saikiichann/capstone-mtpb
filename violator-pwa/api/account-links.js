import { createAccountLinks } from '../server/account-links.js'
import { adminAuth, createFirestoreStore } from '../server/firestore-store.js'
import { corsHeaders, enforceRateLimit, errorResponse, json, preflight, readJson, requireUser } from '../server/http.js'
import { createRateLimiter } from '../server/rate-limit.js'

// POST /api/account-links   (checklist P1, server/account-links.js)
// Header: Authorization: Bearer <Firebase ID token> of a verified account
// Body, one of:
//   { action: 'claim-cash', paymentId }   "Add to My Account" on a cash slip's
//                                         /r/<payment id> page → { status: 'yours' }
//                                         (409/410 with { state } when it can't be added)
//   { action: 'link-guest' }              on sign-in: GCash payments made as a guest
//                                         with this account's email → { linked }

// The app calls link-guest once per sign-in and claim-cash on a button
// press, so this is plenty; payment ids can't be guessed anyway.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 })

export function OPTIONS(request) {
  return preflight(request)
}

export async function POST(request) {
  const headers = corsHeaders(request)
  try {
    enforceRateLimit(limiter, request)
    const auth = adminAuth()
    const user = await requireUser(request, auth)
    const body = await readJson(request)
    const links = createAccountLinks({ store: createFirestoreStore(), auth })

    if (body.action === 'claim-cash') {
      return json(200, await links.claimCash({ user, paymentId: body.paymentId }), headers)
    }
    if (body.action === 'link-guest') return json(200, await links.linkGuestPayments({ user }), headers)
    return json(400, { error: 'Unknown request.' }, headers)
  } catch (err) {
    return errorResponse(err, headers)
  }
}
