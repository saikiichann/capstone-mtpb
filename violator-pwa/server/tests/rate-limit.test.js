// Run with: npm run test:server
// The per-address limit on the payment API (checklist S4).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

process.env.APP_URL = 'https://app.example'

const { clientIp, createRateLimiter } = await import('../rate-limit.js')
const { enforceRateLimit, errorResponse } = await import('../http.js')

describe('rate limiter', () => {
  it('allows the limit, refuses the next, and frees up as the window moves on', () => {
    let clock = 0
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => clock })
    assert.ok(limiter.take('a').ok)
    clock = 10_000
    assert.ok(limiter.take('a').ok)
    clock = 20_000
    assert.ok(limiter.take('a').ok)
    const refused = limiter.take('a')
    assert.equal(refused.ok, false)
    assert.equal(refused.retryAfter, 40, 'seconds until the first call leaves the window')
    // Another address has its own count.
    assert.ok(limiter.take('b').ok)
    // 60 s after the first call, one slot is free again.
    clock = 60_001
    assert.ok(limiter.take('a').ok)
    assert.equal(limiter.take('a').ok, false)
  })

  it('forgets the oldest addresses once it remembers too many', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2, now: () => 0 })
    limiter.take('a')
    limiter.take('b')
    limiter.take('c') // "a" is dropped
    assert.ok(limiter.take('a').ok)
    assert.equal(limiter.take('c').ok, false)
  })

  it('reads the caller address the way Vercel sends it', () => {
    const req = (headers) => new Request('https://app.example/api/x', { headers })
    assert.equal(clientIp(req({ 'x-real-ip': '203.0.113.7' })), '203.0.113.7')
    assert.equal(clientIp(req({ 'x-forwarded-for': '198.51.100.2, 10.0.0.1' })), '198.51.100.2')
    assert.equal(clientIp(req({})), 'unknown')
  })

  it('answers 429 with a plain message once the limit is used up', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    const request = new Request('https://app.example/api/create-checkout', { headers: { 'x-real-ip': '203.0.113.9' } })
    enforceRateLimit(limiter, request)
    let response
    try {
      enforceRateLimit(limiter, request)
    } catch (err) {
      response = errorResponse(err, {})
    }
    assert.equal(response.status, 429)
    const body = await response.json()
    assert.match(body.error, /Too many payment attempts/)
    assert.ok(body.retryAfter > 0)
  })
})
