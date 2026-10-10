// Run with: npm run test:server
// Uses an in-memory store and a fake PayMongo HTTP server, so no real
// accounts or network are needed.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { after, before, beforeEach, describe, it } from 'node:test'

process.env.PAYMONGO_SECRET_KEY = 'sk_test_fake'
process.env.PAYMONGO_WEBHOOK_SECRET = 'whsk_fake'
process.env.APP_URL = 'https://app.example'

const { paymongo, verifyWebhookSignature } = await import('../paymongo.js')
const { createPaymentService, HttpError } = await import('../payments-service.js')
const { isPaymentSettled } = await import('../../src/firebase/mapping.js')

// ---- fake PayMongo --------------------------------------------------------
const sessions = new Map()
const calls = []
let failNextCreate = false
const fake = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body && JSON.parse(body) })
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'POST' && req.url === '/v1/checkout_sessions') {
      if (failNextCreate) {
        failNextCreate = false
        res.statusCode = 400
        return res.end(JSON.stringify({ errors: [{ detail: 'bad request' }] }))
      }
      const id = `cs_${sessions.size + 1}`
      const attrs = JSON.parse(body).data.attributes
      const session = {
        id,
        type: 'checkout_session',
        attributes: { ...attrs, checkout_url: `https://checkout.fake/${id}`, livemode: false, status: 'active', payments: [] },
      }
      sessions.set(id, session)
      return res.end(JSON.stringify({ data: session }))
    }
    const m = req.url.match(/^\/v1\/checkout_sessions\/(.+)$/)
    if (req.method === 'GET' && m && sessions.has(m[1])) {
      return res.end(JSON.stringify({ data: sessions.get(m[1]) }))
    }
    res.statusCode = 404
    res.end(JSON.stringify({ errors: [{ detail: 'not found' }] }))
  })
})

function payInFake(sessionId, { amount, fee = 2306, status = 'paid' } = {}) {
  const s = sessions.get(sessionId)
  const total = amount ?? s.attributes.line_items.reduce((sum, li) => sum + li.amount * li.quantity, 0)
  s.attributes.payments.push({
    id: `pay_${sessionId}`,
    type: 'payment',
    attributes: { status, amount: total, fee, net_amount: total - fee, paid_at: 1789700000, livemode: false, source: { type: 'gcash' } },
  })
}

// ---- in-memory store --------------------------------------------------------
// Mirrors server/firestore-store.js. Violations use the admin app's words.
function memoryStore() {
  const violations = new Map([
    ['v1', { id: 'v1', cin: 'CLMP-2026-0055', fineAmount: 900, paymentStatus: 'Unpaid', plateNumber: 'ABC 1234', violationType: 'Illegal Parking', location: 'Roxas Blvd. Manila', officerName: 'Juan Dela Cruz' }],
    ['v2', { id: 'v2', cin: 'CLMP-2026-0041', fineAmount: 750, paymentStatus: 'Verified', referenceNumber: 'REF-2026-00001' }],
    // Cash recorded at the office, not verified yet.
    ['v3', { id: 'v3', cin: 'CLMP-2026-0042', fineAmount: 750, paymentStatus: 'Pending Verification', referenceNumber: 'REF-2026-00002' }],
    // Rejected by finance staff: can be paid again.
    ['v4', { id: 'v4', cin: 'CLMP-2026-0043', fineAmount: 750, paymentStatus: 'Rejected' }],
    // Last year's violation on the same clamp: the QR id repeats.
    ['v0', { id: 'v0', cin: 'CLMP-2026-0055', fineAmount: 500, paymentStatus: 'Verified', referenceNumber: 'REF-2025-00009', clampedAt: '2025-03-02T01:00:00Z' }],
  ])
  const attempts = new Map()
  const payments = []
  // The admin app's counter, already used by its cash payments.
  const counter = { lastValue: 7 }
  return {
    violations,
    attempts,
    payments,
    counter,
    async getViolationById(id) {
      return violations.get(id) ?? null
    },
    // A clamp's QR id is reused, so the one still to be paid wins.
    async getViolationByCin(cin) {
      const all = [...violations.values()].filter((v) => v.cin === cin)
      return all.find((v) => !isPaymentSettled(v.paymentStatus)) ?? all[0] ?? null
    },
    async getViolatorProfile() {
      return { full_name: 'Juan Dela Cruz' }
    },
    async countRecentAttempts(uid, since) {
      return [...attempts.values()].filter((a) => a.uid === uid && a.createdAt >= since).length
    },
    async createAttempt(data) {
      const id = `att_${attempts.size + 1}`
      attempts.set(id, { ...data })
      return id
    },
    async getAttempt(id) {
      const a = attempts.get(id)
      return a ? { ...a, id } : null
    },
    async updateAttempt(id, patch, { onlyIfStatus } = {}) {
      const a = attempts.get(id)
      if (onlyIfStatus && a.status !== onlyIfStatus) return
      attempts.set(id, { ...a, ...patch })
    },
    async completePayment(id, patch) {
      const a = attempts.get(id)
      if (!a) return 'unknown'
      if (a.status === 'paid') return 'already-paid'
      const v = violations.get(a.violationId)
      if (!v) {
        attempts.set(id, { ...a, ...patch, status: 'review', failureReason: 'violation_missing' })
        return 'review'
      }
      if (isPaymentSettled(v.paymentStatus)) {
        attempts.set(id, { ...a, ...patch, status: 'duplicate' })
        return 'duplicate'
      }
      counter.lastValue += 1
      const referenceNumber = `REF-2026-${String(counter.lastValue).padStart(5, '0')}`
      payments.push({
        violationId: a.violationId,
        cin: a.cin,
        plateNo: a.plateNo,
        amount: a.fineAmount,
        convenienceFee: a.convenienceFee,
        totalAmount: a.totalAmount,
        referenceNumber,
        method: 'GCash',
        status: 'pending',
        uid: a.uid,
        checkoutAttemptId: id,
      })
      violations.set(v.id, { ...v, paymentStatus: 'Pending Verification', paymentMethod: 'GCash', paymentReference: referenceNumber, referenceNumber, totalPaid: a.totalAmount, paidAt: patch.paidAt })
      attempts.set(id, { ...a, ...patch, status: 'paid', referenceNumber })
      return 'paid'
    },
  }
}

const baseInput = { uid: 'user-1', violationId: 'v1', cin: 'CLMP-2026-0055', method: 'gcash', mobileNumber: '0917 123 4567', email: 'juan@example.com', returnOrigin: 'https://app.example' }

describe('payment service', () => {
  let store
  let service

  before(async () => {
    await new Promise((resolve) => fake.listen(0, resolve))
    process.env.PAYMONGO_API_BASE = `http://127.0.0.1:${fake.address().port}`
  })
  after(() => fake.close())
  beforeEach(() => {
    store = memoryStore()
    service = createPaymentService({ store, paymongo })
    calls.length = 0
  })

  it('creates a checkout with the fine and fee from Firestore, and no REF number yet', async () => {
    const result = await service.startCheckout(baseInput)
    assert.equal(result.attemptId, 'att_1')
    assert.equal(result.referenceNumber, undefined)
    assert.match(result.checkoutUrl, /^https:\/\/checkout\.fake\/cs_/)

    const call = calls.find((c) => c.method === 'POST')
    assert.equal(call.auth, `Basic ${Buffer.from('sk_test_fake:').toString('base64')}`)
    const a = call.body.data.attributes
    assert.deepEqual(a.payment_method_types, ['gcash'])
    assert.deepEqual(a.line_items.map((li) => li.amount), [90000, 2306])
    assert.equal(a.success_url, 'https://app.example/payments/att_1/success')
    assert.equal(a.cancel_url, 'https://app.example/v/CLMP-2026-0055/pay')
    assert.equal(a.metadata.attempt_id, 'att_1')
    assert.equal(a.billing.phone, '09171234567')
    assert.equal(a.billing.name, 'Juan Dela Cruz')

    const saved = store.attempts.get('att_1')
    assert.equal(saved.status, 'pending')
    assert.equal(saved.fineAmount, 900)
    assert.equal(saved.totalAmount, 923.06)
    assert.equal(saved.convenienceFee, 23.06)
    assert.equal(saved.checkoutSessionId, 'cs_1')
    assert.equal(saved.referenceNumber, undefined)

    // Nothing reaches the admin app until PayMongo confirms.
    assert.equal(store.payments.length, 0)
    assert.equal(store.counter.lastValue, 7)
  })

  it('accepts GCash only', async () => {
    await assert.rejects(service.startCheckout({ ...baseInput, method: 'maya' }), (e) => e.status === 400)
    assert.equal(calls.length, 0)
  })

  it('rejects bad input, and violations that are verified or waiting for verification', async () => {
    await assert.rejects(service.startCheckout({ ...baseInput, method: 'bitcoin' }), (e) => e instanceof HttpError && e.status === 400)
    await assert.rejects(service.startCheckout({ ...baseInput, mobileNumber: '123' }), (e) => e.status === 400)
    await assert.rejects(service.startCheckout({ ...baseInput, violationId: '', cin: 'NOPE' }), (e) => e.status === 404)
    await assert.rejects(
      service.startCheckout({ ...baseInput, violationId: 'v2', cin: 'CLMP-2026-0041' }),
      (e) => e.status === 409 && e.extra.referenceNumber === 'REF-2026-00001',
    )
    await assert.rejects(
      service.startCheckout({ ...baseInput, violationId: 'v3', cin: 'CLMP-2026-0042' }),
      (e) => e.status === 409 && e.extra.referenceNumber === 'REF-2026-00002',
    )
    assert.equal(calls.length, 0)
  })

  it('lets a rejected payment be paid again', async () => {
    const result = await service.startCheckout({ ...baseInput, violationId: 'v4', cin: 'CLMP-2026-0043' })
    assert.equal(store.attempts.get(result.attemptId).violationId, 'v4')
  })

  it('pays the violation it was given, not another one with the same QR id', async () => {
    // v0 and v1 share CLMP-2026-0055; v0 was paid last year.
    const result = await service.startCheckout(baseInput)
    assert.equal(store.attempts.get(result.attemptId).violationId, 'v1')
    assert.equal(calls[0].body.data.attributes.line_items[0].amount, 90000)
  })

  it('falls back to the QR id and picks the violation still to be paid', async () => {
    const result = await service.startCheckout({ ...baseInput, violationId: '' })
    assert.equal(store.attempts.get(result.attemptId).violationId, 'v1')
  })

  it('marks the attempt failed if PayMongo refuses', async () => {
    failNextCreate = true
    await assert.rejects(service.startCheckout(baseInput), (e) => e.status === 502)
    assert.equal(store.attempts.get('att_1').status, 'failed')
    assert.equal(store.payments.length, 0)
  })

  it('confirm stays pending until PayMongo reports a paid payment, then records it once, the admin app’s way', async () => {
    const { attemptId } = await service.startCheckout(baseInput)
    const waiting = await service.confirm({ uid: 'user-1', attemptId })
    assert.equal(waiting.status, 'pending')
    assert.equal(waiting.payment.referenceNumber, null)

    const sessionId = store.attempts.get(attemptId).checkoutSessionId
    payInFake(sessionId)
    const done = await service.confirm({ uid: 'user-1', attemptId })
    assert.equal(done.status, 'paid')
    // Continues the admin app's counter (it was at 7).
    assert.equal(done.payment.referenceNumber, 'REF-2026-00008')
    assert.equal(done.payment.totalAmount, 923.06)
    assert.equal(done.payment.mobileNumber, undefined, 'contact details stay on the server')

    const a = store.attempts.get(attemptId)
    assert.equal(a.status, 'paid')
    assert.equal(a.paymongoFee, 23.06)
    assert.equal(a.paymongoPaymentId, `pay_${sessionId}`)

    assert.equal(store.payments.length, 1)
    assert.deepEqual(store.payments[0], {
      violationId: 'v1',
      cin: 'CLMP-2026-0055',
      plateNo: 'ABC 1234',
      amount: 900,
      convenienceFee: 23.06,
      totalAmount: 923.06,
      referenceNumber: 'REF-2026-00008',
      method: 'GCash',
      status: 'pending',
      uid: 'user-1',
      checkoutAttemptId: attemptId,
    })

    const v = store.violations.get('v1')
    assert.equal(v.paymentStatus, 'Pending Verification')
    assert.equal(v.paymentReference, 'REF-2026-00008')
    assert.equal(v.totalPaid, 923.06)

    // Asking again doesn't change anything.
    const again = await service.confirm({ uid: 'user-1', attemptId })
    assert.equal(again.status, 'paid')
    assert.equal(store.payments.length, 1)
    assert.equal(store.counter.lastValue, 8)
  })

  it('abandoned checkouts never use up a REF number', async () => {
    await service.startCheckout(baseInput)
    await service.startCheckout(baseInput)
    const third = await service.startCheckout(baseInput)
    payInFake(store.attempts.get(third.attemptId).checkoutSessionId)
    const done = await service.confirm({ uid: 'user-1', attemptId: third.attemptId })
    assert.equal(done.payment.referenceNumber, 'REF-2026-00008')
    assert.equal(store.payments.length, 1)
  })

  it('confirm refuses other users', async () => {
    const { attemptId } = await service.startCheckout(baseInput)
    await assert.rejects(service.confirm({ uid: 'someone-else', attemptId }), (e) => e.status === 404)
  })

  it('flags a payment whose amount does not match', async () => {
    const { attemptId } = await service.startCheckout(baseInput)
    payInFake(store.attempts.get(attemptId).checkoutSessionId, { amount: 100 })
    assert.equal((await service.confirm({ uid: 'user-1', attemptId })).status, 'review')
    assert.equal(store.violations.get('v1').paymentStatus, 'Unpaid')
    assert.equal(store.payments.length, 0)
  })

  it('marks expired sessions', async () => {
    const { attemptId } = await service.startCheckout(baseInput)
    sessions.get(store.attempts.get(attemptId).checkoutSessionId).attributes.status = 'expired'
    assert.equal((await service.confirm({ uid: 'user-1', attemptId })).status, 'expired')
    assert.equal(store.attempts.get(attemptId).status, 'expired')
  })

  it('webhook records the payment by re-fetching the session', async () => {
    const { attemptId } = await service.startCheckout(baseInput)
    const sessionId = store.attempts.get(attemptId).checkoutSessionId
    payInFake(sessionId)
    const event = {
      data: {
        id: 'evt_1',
        type: 'event',
        attributes: {
          type: 'checkout_session.payment.paid',
          livemode: false,
          // Deliberately stale body: the handler must re-fetch the session.
          data: { id: sessionId, type: 'checkout_session', attributes: { payments: [] } },
        },
      },
    }
    assert.deepEqual(await service.handleWebhookEvent(event), { handled: true, status: 'paid' })
    assert.deepEqual(await service.handleWebhookEvent(event), { handled: true, status: 'already-paid' })
    assert.equal(store.payments.length, 1)
    assert.deepEqual(await service.handleWebhookEvent({ data: { attributes: { type: 'payment.paid' } } }), { handled: false, type: 'payment.paid' })
  })

  it('a second paid checkout for the same violation is marked duplicate and never reaches the admin app', async () => {
    const first = await service.startCheckout(baseInput)
    const second = await service.startCheckout(baseInput)
    payInFake(store.attempts.get(first.attemptId).checkoutSessionId)
    payInFake(store.attempts.get(second.attemptId).checkoutSessionId)
    assert.equal((await service.confirm({ uid: 'user-1', attemptId: first.attemptId })).status, 'paid')
    assert.equal((await service.confirm({ uid: 'user-1', attemptId: second.attemptId })).status, 'duplicate')
    assert.equal(store.payments.length, 1)
    assert.equal(store.counter.lastValue, 8)
    assert.equal(store.violations.get('v1').referenceNumber, 'REF-2026-00008')
  })

  it('a cash payment recorded during checkout makes the online one a duplicate', async () => {
    const { attemptId } = await service.startCheckout(baseInput)
    store.violations.set('v1', { ...store.violations.get('v1'), paymentStatus: 'Pending Verification', referenceNumber: 'REF-2026-00008' })
    payInFake(store.attempts.get(attemptId).checkoutSessionId)
    assert.equal((await service.confirm({ uid: 'user-1', attemptId })).status, 'duplicate')
    assert.equal(store.payments.length, 0)
  })

  // ---- receipt email ----
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

  async function payAndConfirm(svc, input = baseInput) {
    const { attemptId } = await svc.startCheckout(input)
    payInFake(store.attempts.get(attemptId).checkoutSessionId)
    return { attemptId, result: await svc.confirm({ uid: 'user-1', attemptId }) }
  }

  it('emails the MTPB receipt once, with the REF number', async () => {
    const mailer = fakeMailer()
    const svc = createPaymentService({ store, paymongo, mailer })
    const { attemptId, result } = await payAndConfirm(svc)
    assert.equal(result.status, 'paid')

    assert.equal(mailer.sent.length, 1)
    const mail = mailer.sent[0]
    assert.equal(mail.to, 'juan@example.com')
    assert.equal(mail.subject, 'MTPB payment received – REF-2026-00008')
    for (const part of ['REF-2026-00008', 'CLMP-2026-0055', 'ABC 1234', 'Illegal Parking', '923.06']) {
      assert.ok(mail.text.includes(part), `text has ${part}`)
      assert.ok(mail.html.includes(part), `html has ${part}`)
    }
    // Looks like a real receipt even for test payments (no sandbox notice).
    assert.ok(!/sandbox/i.test(mail.text + mail.html))
    // The MTPB seal, inside the email, as on the receipt page.
    assert.ok(mail.html.includes('src="cid:mtpb-logo"'))
    const logo = mail.attachments.find((a) => a.cid === 'mtpb-logo')
    assert.equal(logo.contentType, 'image/jpeg')
    assert.deepEqual([...logo.content.subarray(0, 3)], [0xff, 0xd8, 0xff], 'a real JPEG')
    assert.ok(store.attempts.get(attemptId).receiptEmailSentAt)

    // The success page asking again, and the webhook, don't send it twice.
    await svc.confirm({ uid: 'user-1', attemptId })
    const sessionId = store.attempts.get(attemptId).checkoutSessionId
    await svc.handleWebhookEvent({ data: { attributes: { type: 'checkout_session.payment.paid', data: { id: sessionId } } } })
    assert.equal(mailer.sent.length, 1)
  })

  it('records the payment even when the email fails', async () => {
    const svc = createPaymentService({ store, paymongo, mailer: fakeMailer({ fail: true }) })
    const { attemptId, result } = await payAndConfirm(svc)
    assert.equal(result.status, 'paid')
    assert.equal(store.payments.length, 1)
    const a = store.attempts.get(attemptId)
    assert.equal(a.receiptEmailError, 'SMTP down')
    assert.equal(a.receiptEmailSentAt, undefined)
  })

  it('sends nothing without an email address or without Gmail settings', async () => {
    const mailer = fakeMailer()
    const svc = createPaymentService({ store, paymongo, mailer })
    await payAndConfirm(svc, { ...baseInput, email: '' })
    assert.equal(mailer.sent.length, 0)

    store = memoryStore()
    const noMail = createPaymentService({ store, paymongo })
    assert.equal((await payAndConfirm(noMail)).result.status, 'paid')
  })

  it('escapes text from the violation in the HTML email', async () => {
    store.violations.set('v1', { ...store.violations.get('v1'), violationType: '<b>Illegal</b> & Parking' })
    const mailer = fakeMailer()
    await payAndConfirm(createPaymentService({ store, paymongo, mailer }))
    assert.ok(mailer.sent[0].html.includes('&lt;b&gt;Illegal&lt;/b&gt; &amp; Parking'))
    assert.ok(!mailer.sent[0].html.includes('<b>Illegal</b>'))
  })

  // ---- rate limit (checklist S4) ----
  it('allows 5 Pay Now presses in 10 minutes per person, then refuses until the window passes', async () => {
    let clock = new Date('2026-10-11T08:00:00Z').getTime()
    const svc = createPaymentService({ store, paymongo, now: () => new Date(clock) })

    for (let i = 0; i < 5; i += 1) {
      await svc.startCheckout(baseInput)
      clock += 60_000
    }
    const sessionsBefore = calls.filter((c) => c.method === 'POST').length
    await assert.rejects(svc.startCheckout(baseInput), (e) => e.status === 429 && /Too many payment attempts/.test(e.message))
    assert.equal(store.attempts.size, 5, 'no attempt saved')
    assert.equal(calls.filter((c) => c.method === 'POST').length, sessionsBefore, 'PayMongo not called')

    // Someone else isn't affected.
    await svc.startCheckout({ ...baseInput, uid: 'user-2' })

    // Ten minutes after the first press, it's allowed again.
    clock = new Date('2026-10-11T08:10:00.001Z').getTime()
    await svc.startCheckout(baseInput)
  })
})

describe('webhook signature', () => {
  const secret = 'whsk_fake'
  const body = '{"data":{"id":"evt_1"}}'
  const t = '1789700000'
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')

  it('accepts the test signature in test mode', () => {
    assert.equal(verifyWebhookSignature(body, `t=${t},te=${sig},li=`, secret, false), true)
  })
  it('uses the live signature in live mode', () => {
    assert.equal(verifyWebhookSignature(body, `t=${t},te=${sig},li=`, secret, true), false)
    assert.equal(verifyWebhookSignature(body, `t=${t},te=,li=${sig}`, secret, true), true)
  })
  it('rejects tampered bodies, wrong secrets and missing headers', () => {
    assert.equal(verifyWebhookSignature(body + ' ', `t=${t},te=${sig},li=`, secret, false), false)
    assert.equal(verifyWebhookSignature(body, `t=${t},te=${sig},li=`, 'other', false), false)
    assert.equal(verifyWebhookSignature(body, null, secret, false), false)
    assert.equal(verifyWebhookSignature(body, 'garbage', secret, false), false)
  })
})
