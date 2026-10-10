// Run with: npm run test:server
// Emails sent when MTPB staff verify or reject a GCash payment (checklist P2).
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

process.env.APP_URL = 'https://app.example'

const { createStatusNotifier, LOOKBACK_MS } = await import('../status-notifier.js')
const { requireCronSecret } = await import('../http.js')

const NOW = new Date('2026-10-11T08:00:00Z')

// Payments as Mira's Payment Verification leaves them, attempts as ours.
function memoryStore() {
  const attempts = new Map([
    ['att_guest', { uid: 'guest-1', email: 'guest@example.com', cin: 'CLMP-2026-0009', plateNo: 'ABC 1234', totalAmount: 923.06, referenceNumber: 'REF-2026-00015' }],
    ['att_owner', { uid: 'owner-1', email: '', cin: 'CLMP-2026-0010', plateNo: 'XYZ 9999', totalAmount: 923.06, referenceNumber: 'REF-2026-00016' }],
    ['att_noone', { uid: 'guest-2', email: '', cin: 'CLMP-2026-0011', plateNo: 'DEF 5678', totalAmount: 923.06, referenceNumber: 'REF-2026-00017' }],
  ])
  const payments = [
    { id: 'p1', checkoutAttemptId: 'att_guest', referenceNumber: 'REF-2026-00015', verificationStatus: 'Verified', verifiedAt: new Date('2026-10-11T07:50:00Z') },
    { id: 'p2', checkoutAttemptId: 'att_owner', referenceNumber: 'REF-2026-00016', verificationStatus: 'Rejected', rejectionReason: 'Amount does not match', verifiedAt: new Date('2026-10-11T07:55:00Z') },
    { id: 'p3', checkoutAttemptId: 'att_noone', referenceNumber: 'REF-2026-00017', verificationStatus: 'Verified', verifiedAt: new Date('2026-10-11T07:56:00Z') },
    // Cash at the office: no attempt.
    { id: 'p4', referenceNumber: 'REF-2026-00018', verificationStatus: 'Verified', verifiedAt: new Date('2026-10-11T07:57:00Z') },
    // Decided long ago: outside the lookback.
    { id: 'p5', checkoutAttemptId: 'att_guest', verificationStatus: 'Verified', verifiedAt: new Date(NOW.getTime() - LOOKBACK_MS - 1) },
  ]
  return {
    attempts,
    payments,
    async listDecidedAppPayments(since) {
      return payments.filter((p) => p.verifiedAt >= since && p.checkoutAttemptId)
    },
    async getAttempt(id) {
      const a = attempts.get(id)
      return a ? { ...a, id } : null
    },
    async updateAttempt(id, patch) {
      attempts.set(id, { ...attempts.get(id), ...patch })
    },
  }
}

function fakeMailer({ fail = false } = {}) {
  const sent = []
  return {
    sent,
    async send(message) {
      if (fail) throw new Error('SMTP down')
      sent.push(message)
    },
  }
}

const lookupEmail = async (uid) => (uid === 'owner-1' ? 'owner@example.com' : null)

describe('payment status emails', () => {
  let store
  beforeEach(() => {
    store = memoryStore()
  })

  it('emails a verified and a rejected payment once, and skips cash and old ones', async () => {
    const mailer = fakeMailer()
    const notifier = createStatusNotifier({ store, mailer, lookupEmail, now: () => NOW })
    const summary = await notifier.run()
    assert.deepEqual(summary, { checked: 3, sent: 2, skipped: 1, failed: 0 })

    const verified = mailer.sent.find((m) => m.to === 'guest@example.com')
    assert.equal(verified.subject, 'MTPB payment verified – REF-2026-00015')
    assert.ok(verified.text.includes('PAYMENT VERIFIED') && verified.text.includes('CLMP-2026-0009'))
    assert.ok(verified.html.includes('src="cid:mtpb-logo"'))

    // No email typed when paying: the account's verified email is used.
    const rejected = mailer.sent.find((m) => m.to === 'owner@example.com')
    assert.equal(rejected.subject, 'MTPB payment not accepted – REF-2026-00016')
    assert.ok(rejected.text.includes('Reason: Amount does not match'))
    assert.ok(rejected.text.includes('pay again'))

    assert.equal(store.attempts.get('att_guest').statusEmailFor, 'Verified')
    assert.equal(store.attempts.get('att_owner').statusEmailFor, 'Rejected')
    // A guest who typed no email: nobody to tell, remembered as skipped.
    assert.equal(store.attempts.get('att_noone').statusEmailSkipped, 'no email')

    // The next run sends nothing new.
    assert.deepEqual(await notifier.run(), { checked: 3, sent: 0, skipped: 0, failed: 0 })
    assert.equal(mailer.sent.length, 2)
  })

  it('tries again next run when sending fails', async () => {
    const failing = createStatusNotifier({ store, mailer: fakeMailer({ fail: true }), lookupEmail, now: () => NOW })
    const first = await failing.run()
    assert.equal(first.failed, 2)
    assert.equal(store.attempts.get('att_guest').statusEmailError, 'SMTP down')
    assert.equal(store.attempts.get('att_guest').statusEmailFor, undefined)

    const mailer = fakeMailer()
    const second = await createStatusNotifier({ store, mailer, lookupEmail, now: () => NOW }).run()
    assert.equal(second.sent, 2)
  })

  it('does nothing without Gmail settings', async () => {
    const summary = await createStatusNotifier({ store, mailer: null, now: () => NOW }).run()
    assert.equal(summary.disabled, true)
    assert.equal(store.attempts.get('att_guest').statusEmailFor, undefined)
  })

  it('escapes the rejection reason in the HTML email', async () => {
    store.payments[1].rejectionReason = '<script>x</script> & more'
    const mailer = fakeMailer()
    await createStatusNotifier({ store, mailer, lookupEmail, now: () => NOW }).run()
    const html = mailer.sent.find((m) => m.to === 'owner@example.com').html
    assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt; &amp; more'))
    assert.ok(!html.includes('<script>'))
  })
})

describe('cron secret', () => {
  const req = (auth) => new Request('https://app.example/api/notify-payment-updates', { headers: auth ? { authorization: auth } : {} })

  it('accepts only the right secret', () => {
    assert.doesNotThrow(() => requireCronSecret(req('Bearer s3cret-value'), 's3cret-value'))
    for (const auth of ['Bearer wrong', 'Bearer s3cret-valu', 's3cret-value', null]) {
      assert.throws(() => requireCronSecret(req(auth), 's3cret-value'), (e) => e.status === 401)
    }
  })

  it('refuses everything while no secret is set', () => {
    assert.throws(() => requireCronSecret(req('Bearer '), ''), (e) => e.status === 401)
  })
})
