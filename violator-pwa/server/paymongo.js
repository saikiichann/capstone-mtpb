import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from './config.js'

// Minimal PayMongo client (Checkout Sessions API, v1).
// Docs: https://docs.paymongo.com/docs/payment-channels-hosted-checkout

export class PayMongoError extends Error {
  constructor(message, status, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function request(method, path, body) {
  const auth = Buffer.from(`${config.paymongoSecretKey}:`).toString('base64')
  const res = await fetch(`${config.paymongoApiBase}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = json?.errors?.[0]?.detail || res.statusText
    throw new PayMongoError(`PayMongo ${method} ${path} failed: ${detail}`, res.status, json?.errors)
  }
  return json.data
}

export const paymongo = {
  createCheckoutSession(attributes) {
    return request('POST', '/v1/checkout_sessions', { data: { attributes } })
  },
  retrieveCheckoutSession(id) {
    return request('GET', `/v1/checkout_sessions/${encodeURIComponent(id)}`)
  },
}

// PayMongo payment_method_types value for each of our method ids.
export const PAYMONGO_METHOD = { gcash: 'gcash' }

// Checks the Paymongo-Signature header: "t=<unix>,te=<test sig>,li=<live sig>".
// The signature is HMAC-SHA256 of "<t>.<raw body>" with the webhook secret.
export function verifyWebhookSignature(rawBody, header, secret, livemode) {
  if (!header || !secret) return false
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const i = part.indexOf('=')
      return [part.slice(0, i).trim(), part.slice(i + 1).trim()]
    }),
  )
  const given = livemode ? parts.li : parts.te
  if (!parts.t || !given) return false
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(given, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

// The first successful payment inside a checkout session, if any.
export function findPaidPayment(session) {
  const payments = session?.attributes?.payments ?? []
  return payments.find((p) => p?.attributes?.status === 'paid') ?? null
}
