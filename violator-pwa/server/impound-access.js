import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from './config.js'

// Impound desk QR (/pay-impound). The owner finds their impound by plate
// number + the last 4 of the OVR No. on their Blue Ticket, and gets this
// short-lived pass to that one violation. The app keeps it like a clamp's
// scan token (src/firebase/scan-tokens.js), so the violation, Pay Now and
// receipt pages work unchanged. Once a payment is started, the usual
// "whoever started a payment" rule keeps the receipt visible.
//
// The pass is signed, not stored: nothing new in Firestore. It is only good
// for the same signed-in (guest) user and the same violation.

export const IMPOUND_ACCESS_MINUTES = 30
const PREFIX = 'imp.'

export const isImpoundToken = (token) => typeof token === 'string' && token.startsWith(PREFIX)

export function createImpoundAccess({ secret, now = () => Date.now() }) {
  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url')

  return {
    // → { token, expiresAt }
    issue({ uid, violationId }) {
      const expires = now() + IMPOUND_ACCESS_MINUTES * 60_000
      const payload = Buffer.from(JSON.stringify({ u: uid, v: violationId, e: expires })).toString('base64url')
      return { token: `${PREFIX}${payload}.${sign(payload)}`, expiresAt: new Date(expires).toISOString() }
    },

    allows(token, { uid, violationId }) {
      if (!isImpoundToken(token) || !uid || !violationId) return false
      const [payload, signature] = token.slice(PREFIX.length).split('.')
      if (!payload || !signature) return false
      const expected = Buffer.from(sign(payload))
      const given = Buffer.from(signature)
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false
      try {
        const { u, v, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
        return u === uid && v === violationId && Number(e) > now()
      } catch {
        return false
      }
    },
  }
}

// The signing key comes from the service account's private key, a secret the
// server already has, so there's nothing new to set up on Vercel.
export function impoundAccessFromConfig() {
  const { private_key: privateKey } = JSON.parse(config.firebaseServiceAccount)
  return createImpoundAccess({ secret: createHmac('sha256', privateKey).update('mtpb-impound-access-v1').digest() })
}
