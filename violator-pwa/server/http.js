import { config } from './config.js'
import { HttpError } from './payments-service.js'

// Small helpers shared by the api/ functions.

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

// The site that called us, if we trust it (APP_URL or ALLOWED_ORIGINS).
export function trustedOrigin(request) {
  const origin = (request.headers.get('origin') || '').replace(/\/+$/, '')
  if (!origin) return null
  if (origin === config.appUrl || config.allowedOrigins.includes(origin)) return origin
  return null
}

export function corsHeaders(request) {
  const origin = trustedOrigin(request)
  if (!origin) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

export function preflight(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}

// Verifies the Firebase ID token sent by the app and returns the user.
// Accounts must have a verified email. Guests (anonymous sign-in, used by
// someone who scanned the clamp's QR code) are allowed: the token still
// proves the request came from this app, and the payment is tied to that uid.
export async function requireUser(request, auth) {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new HttpError(401, 'Please log in again.')
  let decoded
  try {
    decoded = await auth.verifyIdToken(token)
  } catch {
    throw new HttpError(401, 'Your session expired. Please log in again.')
  }
  const isGuest = decoded.firebase?.sign_in_provider === 'anonymous'
  if (!isGuest && !decoded.email_verified) {
    throw new HttpError(403, 'Verify your email before paying.')
  }
  return { ...decoded, isGuest }
}

export async function readJson(request) {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, 'Invalid request.')
  }
}

// Turns errors into JSON responses without leaking internal details.
export function errorResponse(err, headers) {
  if (err instanceof HttpError) {
    const { cause, ...extra } = err.extra ?? {}
    if (cause) console.error(err.message, cause)
    return json(err.status, { error: err.message, ...extra }, headers)
  }
  console.error(err)
  return json(500, { error: 'Something went wrong. Please try again.' }, headers)
}
