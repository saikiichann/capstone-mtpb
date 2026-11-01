// Run with: npm run test:server
// Online impound payments: paid = verified + released in one transaction
// (server/impound-release.js, completePayment() in server/firestore-store.js).
// Clamp payments still go to Payment Verification.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const { createFirestoreStore } = await import('../firestore-store.js')
const { buildReceiptEmail } = await import('../receipt-email.js')

// Just enough of Firestore for completePayment(). Like the real one, a
// transaction refuses reads after its first write.
function memoryDb(docs) {
  const data = new Map(Object.entries(docs))
  let autoId = 0
  const ref = (path) => ({ path, id: path.split('/').pop() })
  const snapshot = (r) => ({ exists: data.has(r.path), id: r.id, ref: r, data: () => data.get(r.path) })
  const collection = (name) => ({
    doc: (id) => ref(`${name}/${id ?? `auto-${++autoId}`}`),
    where: (field, op, value) => ({
      limit: () => ({ query: { name, field, value } }),
    }),
  })
  return {
    data,
    collection,
    docsIn: (name) => [...data.entries()].filter(([path]) => path.startsWith(`${name}/`)).map(([, value]) => value),
    async runTransaction(fn) {
      const writes = []
      const tx = {
        async get(target) {
          if (writes.length) throw new Error('Firestore: all reads must come before any write')
          if (!target.query) return snapshot(target)
          const { name, field, value } = target.query
          const found = [...data.entries()]
            .filter(([path, doc]) => path.startsWith(`${name}/`) && doc[field] === value)
            .map(([path]) => snapshot(ref(path)))
          return { empty: found.length === 0, docs: found }
        },
        set(r, value, options) {
          writes.push(() => data.set(r.path, options?.merge ? { ...data.get(r.path), ...value } : value))
        },
        update(r, value) {
          writes.push(() => {
            if (!data.has(r.path)) throw new Error(`No document to update: ${r.path}`)
            data.set(r.path, { ...data.get(r.path), ...value })
          })
        },
      }
      const result = await fn(tx)
      for (const write of writes) write()
      return result
    },
  }
}

const paidAt = new Date('2026-11-02T03:00:00Z')
const patch = { paidAt, paymongoPaymentId: 'pay_test_1', livemode: false }

function impoundSetup({ impoundRecordId = 'rec-1', recordDoc = { status: 'Impounded', sourceViolationId: 'imp-1' } } = {}) {
  return memoryDb({
    'checkoutAttempts/att-1': {
      status: 'pending', uid: 'guest-1', isGuest: true, violationId: 'imp-1', cin: 'IMP-2026-0007', plateNo: 'ABC 1234',
      chargeType: 'Impound', impoundFee: 2100, fineAmount: 2100, convenienceFee: 52.5, totalAmount: 2152.5,
    },
    'violations/imp-1': {
      cin: 'IMP-2026-0007', enforcementType: 'impounded', impoundStatus: 'Impounded', plateNo: 'ABC 1234', uovrNo: 'MT-0012345',
      impoundFee: 2100, impoundRecordId, location: 'Taft Ave', paymentStatus: 'Unpaid', releaseStatus: 'Pending',
    },
    'counters/paymentReference': { lastValue: 41, prefix: 'REF' },
    'counters/releaseOrder': { lastValue: 9, prefix: 'ORD' },
    ...(recordDoc ? { 'impoundRecords/rec-1': recordDoc } : {}),
  })
}

describe('online impound payment', () => {
  it('is verified and released in one go, with one release log', async () => {
    const db = impoundSetup()
    const store = createFirestoreStore({ db })
    assert.equal(await store.completePayment('att-1', patch), 'paid')

    const v = db.data.get('violations/imp-1')
    assert.equal(v.paymentStatus, 'Verified')
    assert.equal(v.verificationStatus, 'Verified')
    assert.equal(v.releaseStatus, 'Released')
    assert.equal(v.impoundStatus, 'Released')
    assert.equal(v.releaseOrderId, 'ORD-2026-00010')
    assert.equal(v.referenceNumber, 'REF-2026-00042')
    assert.equal(v.paymentReference, 'REF-2026-00042')
    assert.equal(v.verifiedBy, 'PayMongo (online)')
    assert.equal(v.verifiedByRole, 'violator-app')
    assert.equal(v.releaseDurationMinutes, 0)
    assert.equal(v.paymentMethod, 'GCash')
    assert.equal(v.impoundFeePaid, 2100, 'impound fee only, not the GCash fee')
    assert.equal(v.totalPaid, 2152.5)
    assert.equal('orNumber' in v, false, 'no OR for online payments')

    const [payment] = db.docsIn('payments')
    assert.equal(payment.status, 'Verified')
    assert.equal(payment.verificationStatus, 'Verified')
    assert.equal(payment.chargeType, 'Impound')
    assert.equal(payment.method, 'GCash')
    assert.equal(payment.fineAmount, 0)
    assert.equal(payment.impoundFee, 2100)
    assert.equal(payment.amount, 2100)
    assert.equal(payment.convenienceFee, 52.5)
    assert.equal(payment.totalAmount, 2152.5)
    assert.equal(payment.uovrNo, 'MT-0012345')
    assert.equal(payment.releaseOrderId, 'ORD-2026-00010')
    assert.equal(payment.paymentLocation, 'Online')
    assert.equal(payment.checkoutAttemptId, 'att-1')
    assert.equal(payment.uid, 'guest-1')

    const logs = db.docsIn('releaseLog')
    assert.equal(logs.length, 1)
    assert.equal(logs[0].orderId, 'ORD-2026-00010')
    assert.equal(logs[0].chargeType, 'Impound')
    assert.equal(logs[0].clampId, null)
    assert.equal(logs[0].releasedByRole, 'violator-app')
    assert.ok(logs[0].releasedAt)

    const record = db.data.get('impoundRecords/rec-1')
    assert.equal(record.status, 'Released', 'the car leaves Vehicles in Yard')
    assert.equal(record.paymentStatus, 'Verified')
    assert.equal(record.releaseOrderId, 'ORD-2026-00010')
    assert.equal(record.releasedBy, 'PayMongo (online)')
    assert.equal('orNumber' in record, false)

    assert.equal(db.data.get('counters/paymentReference').lastValue, 42)
    assert.equal(db.data.get('counters/releaseOrder').lastValue, 10)
    const attempt = db.data.get('checkoutAttempts/att-1')
    assert.equal(attempt.status, 'paid')
    assert.equal(attempt.releasedOnPayment, true)
  })

  it('records it only once when the webhook and the success page both confirm', async () => {
    const db = impoundSetup()
    const store = createFirestoreStore({ db })
    assert.equal(await store.completePayment('att-1', patch), 'paid')
    assert.equal(await store.completePayment('att-1', patch), 'already-paid')
    assert.equal(db.docsIn('payments').length, 1)
    assert.equal(db.docsIn('releaseLog').length, 1)
    assert.equal(db.data.get('counters/releaseOrder').lastValue, 10)
  })

  it('refuses one already paid at the desk', async () => {
    const db = impoundSetup()
    db.data.set('violations/imp-1', { ...db.data.get('violations/imp-1'), paymentStatus: 'Verified' })
    assert.equal(await createFirestoreStore({ db }).completePayment('att-1', patch), 'duplicate')
    assert.equal(db.docsIn('payments').length, 0)
    assert.equal(db.docsIn('releaseLog').length, 0)
  })

  it('finds the impound record by sourceViolationId when impoundRecordId is missing', async () => {
    const db = impoundSetup({ impoundRecordId: null })
    await createFirestoreStore({ db }).completePayment('att-1', patch)
    assert.equal(db.data.get('impoundRecords/rec-1').status, 'Released')
  })

  it('still records the payment when there is no impound record', async () => {
    const db = impoundSetup({ impoundRecordId: null, recordDoc: null })
    assert.equal(await createFirestoreStore({ db }).completePayment('att-1', patch), 'paid')
    assert.equal(db.data.get('violations/imp-1').releaseStatus, 'Released')
  })

  it('emails one official receipt that says paid and released', () => {
    const { subject, html, text } = buildReceiptEmail({
      releasedOnPayment: true, referenceNumber: 'REF-2026-00042', releaseOrderId: 'ORD-2026-00010', cin: 'IMP-2026-0007',
      plateNo: 'ABC 1234', impoundFee: 2100, convenienceFee: 52.5, totalAmount: 2152.5, paidAt,
    })
    const body = `${subject} ${html ?? ''} ${text ?? ''}`
    assert.match(body, /released/i)
    assert.match(body, /ORD-2026-00010/)
    assert.match(body, /OFFICIAL RECEIPT/)
  })
})

describe('online clamp payment', () => {
  it('still waits for Payment Verification', async () => {
    const db = memoryDb({
      'checkoutAttempts/att-2': { status: 'pending', uid: 'owner-1', violationId: 'clmp-1', cin: 'CLMP-2026-0001', plateNo: 'XYZ 9999', chargeType: 'Clamp', fineAmount: 900, convenienceFee: 22.5, totalAmount: 922.5 },
      'violations/clmp-1': { cin: 'CLMP-2026-0001', enforcementType: 'clamped', plateNo: 'XYZ 9999', paymentStatus: 'Unpaid' },
      'counters/paymentReference': { lastValue: 1, prefix: 'REF' },
    })
    assert.equal(await createFirestoreStore({ db }).completePayment('att-2', patch), 'paid')
    assert.equal(db.data.get('violations/clmp-1').paymentStatus, 'Pending Verification')
    assert.equal(db.docsIn('payments')[0].status, 'pending')
    assert.equal(db.docsIn('releaseLog').length, 0)
    assert.equal(db.data.has('counters/releaseOrder'), false)
  })
})
