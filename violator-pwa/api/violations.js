import { adminAuth, createFirestoreStore } from '../server/firestore-store.js'
import { corsHeaders, enforceRateLimit, errorResponse, json, preflight, readJson, requireUser } from '../server/http.js'
import { createRateLimiter } from '../server/rate-limit.js'
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
// The app reads clamps and violations only through here (checklist S2), so
// the database can be closed to everyone but MTPB staff. Who sees what is
// decided in server/violation-access.js.

// Generous for normal use (a few calls per screen), tight for anyone
// trying violation numbers one after another.
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 })

export function OPTIONS(request) {
  return preflight(request)
}

export async function POST(request) {
  const headers = corsHeaders(request)
  try {
    enforceRateLimit(limiter, request)
    const user = await requireUser(request, adminAuth())
    const body = await readJson(request)
    const access = createViolationAccess({ store: createFirestoreStore() })

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
