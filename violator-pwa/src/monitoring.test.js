// Run with: npm test
// Crash reports must not carry personal data or the clamp's secret scan token.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { monitoringEnabled, scrubDeep, scrubText } from './monitoring.js'

describe('crash report scrubbing', () => {
  it('hides emails, scan tokens and mobile numbers', () => {
    assert.equal(scrubText('sent to juan.delacruz+test@gmail.com'), 'sent to [email]')
    assert.equal(scrubText('https://app.example/q/abc123XYZ?x=1'), 'https://app.example/q/[token]?x=1')
    assert.equal(scrubText('/scan?t=s3cr3t-token&lang=fil'), '/scan?t=[token]&lang=fil')
    assert.equal(scrubText('mobile 09171234567, 0917-123-4567'), 'mobile [mobile], [mobile]')
    assert.equal(scrubText('call +639171234567 or +63 917 123 4567'), 'call [mobile] or [mobile]')
  })

  it('leaves the details needed to find the bug', () => {
    for (const text of ['REF-2026-00011', 'CLMP-2026-0921', '/v/abc123', 'ABC 1234', 'TypeError: x is undefined']) {
      assert.equal(scrubText(text), text)
    }
  })

  it('cleans every string in a report, however deep', () => {
    const event = {
      request: { url: 'https://mtpb-violators-pwa.vercel.app/q/tok123' },
      exception: { values: [{ value: 'Failed for maria@example.com' }] },
      breadcrumbs: [{ category: 'navigation', data: { from: '/scan?t=tok123', to: '/q/tok123' } }],
      extra: { count: 3, ok: true },
    }
    const clean = scrubDeep(event)
    assert.equal(clean.request.url, 'https://mtpb-violators-pwa.vercel.app/q/[token]')
    assert.equal(clean.exception.values[0].value, 'Failed for [email]')
    assert.deepEqual(clean.breadcrumbs[0].data, { from: '/scan?t=[token]', to: '/q/[token]' })
    assert.deepEqual(clean.extra, { count: 3, ok: true })
  })

  it('is off outside a production build with a DSN', () => {
    assert.equal(monitoringEnabled, false)
  })
})
