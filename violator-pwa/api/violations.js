import { adminAuth, createFirestoreStore } from '../server/firestore-store.js'
import { corsHeaders, enforceRateLimit, errorResponse, json, preflight, readJson, requireUser } from '../server/http.js'
import { impoundAccessFromConfig } from '../server/impound-access.js'
import { HttpError } from '../server/payments-service.js'
import { clientIp, createRateLimiter } from '../server/rate-limit.js'
import { createViolationAccess, publicViolation } from '../server/violation-access.js'

// POST /api/violations
// Header: Authorization: Bearer <Firebase ID token> (guests: anonymous)
// Body, one of:
//   { action: 'scan', token }          the QR sticker's scan token
//                                      → { found, clampNumber, status, violation }
//   { action: 'get', ref, token? }     a violation by id or violation number
//                                      → { violation }   (404 if not allowed)
//   { action: 'mine' }                 violations on the owner's verified vehicles
//                                      → { violations }
//   { action: 'impound-lookup', plate, ovrLast4 }
//                                      impound desk QR (/pay-impound)
//                                      → { violation, token, expiresAt }
//                                      (404, same message, if no unpaid match)
// The app reads clamps and violations only through here (checklist S2), so
// the database can be closed to everyone but MTPB staff. Who sees what is
// decided in server/violation-access.js.

// Generous for normal use (a few calls per screen), tight for anyone
// trying violation numbers one after another.
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 })
// Much tighter for the impound lookup, so the last 4 of an OVR No. can't be
// guessed: per IP and per user.
const impoundLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 })

export function OPTIONS(request) {
  return preflight(request)
}

export async function POST(request) {
  const headers = corsHeaders(request)
  try {
    enforceRateLimit(limiter, request)
    const user = await requireUser(request, adminAuth())
    const body = await readJson(request)
    const access = createViolationAccess({ store: createFirestoreStore(), impoundAccess: impoundAccessFromConfig() })

    if (body.action === 'impound-lookup') {
      for (const key of [clientIp(request), `uid:${user.uid}`]) {
        const { ok, retryAfter } = impoundLimiter.take(key)
        if (!ok) throw new HttpError(429, 'Too many tries. Please wait a minute and try again.', { retryAfter })
      }
      const { violation, token, expiresAt } = await access.impoundLookup({ user, plate: body.plate, ovrLast4: body.ovrLast4 })
      return json(200, { violation: publicViolation(violation), token, expiresAt }, headers)
    }
    if (body.action === 'scan') return json(200, await access.scan({ token: body.token }), headers)
    if (body.action === 'get') {
      const violation = await access.getViolation({ user, ref: body.ref, token: body.token })
      return json(200, { violation: publicViolation(violation) }, headers)
    }
    if (body.action === 'mine') {
      const violations = await access.listMine({ user })
      return json(200, { violations: violations.map(publicViolation) }, headers)
    }
    return json(400, { error: 'Unknown request.' }, headers)
  } catch (err) {
    return errorResponse(err, headers)
  }
}
