import { adminApp, adminAuth } from '../server/firestore-store.js'
import { corsHeaders, errorResponse, json, preflight, readJson } from '../server/http.js'
import { HttpError } from '../server/payments-service.js'
import { clientIp, createRateLimiter } from '../server/rate-limit.js'
import { createStaffPassword, createStaffStore, requireStaffToken } from '../server/staff-password.js'

// POST /api/staff-password   (server/staff-password.js)
// For the MTPB admin dashboard's staff accounts, not for violators.
// Body, one of:
//   { action: 'request', username }   "Forgot password?" on the admin login
//                                     page. No sign-in. Always the same reply.
//   { action: 'reset', uid }          IT Admin only (Authorization: Bearer
//                                     <Firebase ID token>) → { temporaryPassword }
//
// The admin dashboard's address must be in ALLOWED_ORIGINS.

// Per address: a few forgotten-password requests, more room for the IT Admin.
const requestLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60_000 })
const resetLimiter = createRateLimiter({ limit: 30, windowMs: 15 * 60_000 })

const limit = (limiter, request) => {
  const { ok, retryAfter } = limiter.take(clientIp(request))
  if (!ok) throw new HttpError(429, 'Too many requests. Please wait a few minutes and try again.', { retryAfter })
}

export function OPTIONS(request) {
  return preflight(request)
}

export async function POST(request) {
  const headers = corsHeaders(request)
  try {
    const body = (await readJson(request)) ?? {}
    const auth = adminAuth()
    const service = createStaffPassword({ store: createStaffStore(adminApp()), auth })

    if (body.action === 'request') {
      limit(requestLimiter, request)
      return json(200, await service.request({ username: body.username }), headers)
    }
    if (body.action === 'reset') {
      limit(resetLimiter, request)
      const caller = await requireStaffToken(request, auth)
      return json(200, await service.reset({ caller, uid: body.uid }), headers)
    }
    return json(400, { error: 'Unknown request.' }, headers)
  } catch (err) {
    return errorResponse(err, headers)
  }
}
