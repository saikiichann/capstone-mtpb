// Run with: npm run test:server
// Checklist P1: guest GCash payments follow the guest's email into their
// account, cash payments are added from the slip's QR once MTPB verifies
// them (within 7 days), and nobody can take another account's payment.
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

const { CASH_CLAIM_DAYS, cashClaimState, createAccountLinks } = await import('../account-links.js')
const { normalizeViolation } = await import('../../src/firebase/mapping.js')

const NOW = new Date('2026-10-13T12:00:00Z')
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

// In-memory store with the same linking rules as firestore-store.js.
function memoryStore() {
  const violations = new Map([
    ['v-cash', { cin: 'CLMP-2026-0015', plateNo: 'GHL 9012', vehicleType: 'Sedan', vehicleMake: 'Toyota', vehicleColor: 'White', violatorUid: null, guestId: 'guest_GHL 9012' }],
    ['v-gcash', { cin: 'CLMP-2026-0016', plateNo: 'ABC 1234', violatorUid: null }],
    ['v-other', { cin: 'CLMP-2026-0017', plateNo: 'XYZ 9999', violatorUid: null }],
  ])
  const payments = new Map([
    ['cashVerified00000001', { violationId: 'v-cash', method: 'Cash', status: 'Verified', verifiedAt: daysAgo(2), violatorUid: null }],
    ['cashPending000000001', { violationId: 'v-cash', method: 'Cash', status: 'Pending Verification', violatorUid: null }],
    ['cashOld0000000000001', { violationId: 'v-cash', method: 'Cash', status: 'Verified', verifiedAt: daysAgo(8), violatorUid: null }],
    ['cashRejected00000001', { violationId: 'v-cash', method: 'Cash', status: 'Rejected', violatorUid: null }],
    ['gcashGuest000000001', { violationId: 'v-gcash', method: 'GCash', status: 'pending', uid: 'anon-1' }],
    ['gcashOther000000001', { violationId: 'v-other', method: 'GCash', status: 'pending', uid: 'real-2' }],
  ])
  const attempts = new Map([
    ['att-guest', { uid: 'anon-1', isGuest: true, email: 'Juan@Gmail.com', emailLower: 'juan@gmail.com', status: 'paid', paymentId: 'gcashGuest000000001' }],
    ['att-other', { uid: 'real-2', isGuest: false, email: 'juan@gmail.com', emailLower: 'juan@gmail.com', status: 'paid', paymentId: 'gcashOther000000001' }],
    ['att-unpaid', { uid: 'anon-3', isGuest: true, email: 'juan@gmail.com', emailLower: 'juan@gmail.com', status: 'expired' }],
  ])
  const vehicles = []
  return {
    violations,
    payments,
    attempts,
    vehicles,
    async getViolationById(id) {
      return violations.has(id) ? normalizeViolation(id, violations.get(id)) : null
    },
    async getViolatorProfile(uid) {
      return { full_name: uid === 'juan' ? 'Juan Dela Cruz' : 'Someone Else' }
    },
    async getPaymentById(id) {
      return payments.get(id) ?? null
    },
    async getAttempt(id) {
      return attempts.has(id) ? { ...attempts.get(id), id } : null
    },
    async listPaidAttemptsByEmail(email) {
      const lower = email.toLowerCase()
      return [...attempts.entries()]
        .filter(([, a]) => (a.emailLower === lower || a.email === email) && a.status === 'paid')
        .map(([id, a]) => ({ ...a, id }))
    },
    async listOwnerVehicles(uid) {
      return vehicles.filter((v) => v.ownerUid === uid)
    },
    async createVehicle(data) {
      vehicles.push(data)
    },
    async linkPaymentToAccount({ paymentId, attemptId, uid, fromUid, name, linkedAt }) {
      const payment = payments.get(paymentId)
      if (!payment) return { status: 'missing' }
      const violation = violations.get(payment.violationId)
      const taken =
        (payment.violatorUid && payment.violatorUid !== uid) ||
        (payment.uid && payment.uid !== uid && payment.uid !== fromUid) ||
        (violation?.violatorUid && violation.violatorUid !== uid)
      if (taken) return { status: 'taken' }
      if (payment.violatorUid === uid && payment.uid === uid) return { status: 'already', violationId: payment.violationId }
      Object.assign(payment, { violatorUid: uid, violatorName: name, uid, linkedAt })
      if (violation) Object.assign(violation, { violatorUid: uid, violatorName: name })
      const attempt = attemptId && attempts.get(attemptId)
      if (attempt && attempt.uid !== uid) Object.assign(attempt, { uid, linkedFromGuestUid: attempt.uid })
      return { status: 'linked', violationId: payment.violationId }
    },
  }
}

// anon-1 is an anonymous guest; real-2 is someone's real account.
const auth = {
  async getUser(uid) {
    if (uid === 'real-2') return { uid, email: 'juan@gmail.com', providerData: [{ providerId: 'password' }] }
    return { uid, email: undefined, providerData: [] }
  },
}

const juan = { uid: 'juan', isGuest: false, email: 'juan@gmail.com', email_verified: true }
const maria = { uid: 'maria', isGuest: false, email: 'maria@gmail.com', email_verified: true }
const guest = { uid: 'anon-9', isGuest: true }

describe('cash claim state', () => {
  it('waits for MTPB to verify, then gives 7 days from the verification', () => {
    const pending = { method: 'Cash', status: 'Pending Verification' }
    assert.deepEqual(cashClaimState(pending, { now: NOW }), { state: 'verify-first', deadline: null })

    const verified = { method: 'Cash', status: 'Verified', verifiedAt: daysAgo(2) }
    const open = cashClaimState(verified, { now: NOW })
    assert.equal(open.state, 'available')
    assert.equal(open.deadline, new Date(daysAgo(2).getTime() + CASH_CLAIM_DAYS * 86400000).toISOString())

    assert.equal(cashClaimState({ ...verified, verifiedAt: daysAgo(8) }, { now: NOW }).state, 'expired')
    assert.equal(cashClaimState({ method: 'Cash', status: 'Rejected' }, { now: NOW }).state, 'rejected')
    assert.equal(cashClaimState({ method: 'GCash', status: 'Verified' }, { now: NOW }).state, 'not-cash')
  })

  it('says whose it is once someone added it', () => {
    const linked = { method: 'Cash', status: 'Verified', verifiedAt: daysAgo(1), violatorUid: 'juan' }
    assert.equal(cashClaimState(linked, { uid: 'juan', now: NOW }).state, 'yours')
    assert.equal(cashClaimState(linked, { uid: 'maria', now: NOW }).state, 'taken')
    assert.equal(cashClaimState(linked, { now: NOW }).state, 'taken')
  })
})

describe('adding a cash payment from the slip', () => {
  let store, links
  beforeEach(() => {
    store = memoryStore()
    links = createAccountLinks({ store, auth, now: () => NOW })
  })

  it('links the payment and violation to the account and adds the plate as pending', async () => {
    assert.deepEqual(await links.claimCash({ user: juan, paymentId: 'cashVerified00000001' }), { status: 'yours' })
    const payment = store.payments.get('cashVerified00000001')
    assert.equal(payment.violatorUid, 'juan')
    assert.equal(payment.violatorName, 'Juan Dela Cruz')
    assert.equal(payment.uid, 'juan', 'Payment History finds it by uid')
    assert.equal(store.violations.get('v-cash').violatorUid, 'juan')
    assert.equal(store.violations.get('v-cash').guestId, 'guest_GHL 9012', "Ian's guestId is left alone")
    assert.deepEqual(
      store.vehicles.map((v) => [v.ownerUid, v.plateNumber, v.verificationStatus, v.source, v.make]),
      [['juan', 'GHL 9012', 'pending', 'payment', 'Toyota']],
    )
  })

  it('adding it twice changes nothing and adds no second vehicle', async () => {
    await links.claimCash({ user: juan, paymentId: 'cashVerified00000001' })
    assert.deepEqual(await links.claimCash({ user: juan, paymentId: 'cashVerified00000001' }), { status: 'yours' })
    assert.equal(store.vehicles.length, 1)
  })

  it('another account can never take it', async () => {
    await links.claimCash({ user: juan, paymentId: 'cashVerified00000001' })
    await assert.rejects(
      links.claimCash({ user: maria, paymentId: 'cashVerified00000001' }),
      (e) => e.status === 409 && e.extra.state === 'taken',
    )
    assert.equal(store.payments.get('cashVerified00000001').violatorUid, 'juan')
  })

  it('refuses before verification, after 7 days, when rejected, and for GCash', async () => {
    const cases = [
      ['cashPending000000001', 'verify-first'],
      ['cashOld0000000000001', 'expired'],
      ['cashRejected00000001', 'rejected'],
      ['gcashGuest000000001', 'not-cash'],
    ]
    for (const [paymentId, state] of cases) {
      await assert.rejects(links.claimCash({ user: juan, paymentId }), (e) => e.extra.state === state, state)
    }
    assert.equal(store.vehicles.length, 0)
  })

  it('needs a verified account, and a payment that exists', async () => {
    await assert.rejects(links.claimCash({ user: guest, paymentId: 'cashVerified00000001' }), (e) => e.status === 403)
    await assert.rejects(
      links.claimCash({ user: { ...juan, email_verified: false }, paymentId: 'cashVerified00000001' }),
      (e) => e.status === 403,
    )
    await assert.rejects(links.claimCash({ user: juan, paymentId: 'ZZZZZZZZZZZZZZZZZZZZ' }), (e) => e.status === 404)
  })
})

describe('guest GCash payments follow the email', () => {
  let store, links
  beforeEach(() => {
    store = memoryStore()
    links = createAccountLinks({ store, auth, now: () => NOW })
  })

  it("moves the guest's paid payments to the account with the same email, whatever the capitals", async () => {
    assert.deepEqual(await links.linkGuestPayments({ user: juan }), { linked: 1 })
    const payment = store.payments.get('gcashGuest000000001')
    assert.equal(payment.uid, 'juan')
    assert.equal(payment.violatorUid, 'juan')
    assert.equal(store.attempts.get('att-guest').uid, 'juan')
    assert.equal(store.attempts.get('att-guest').linkedFromGuestUid, 'anon-1')
    assert.deepEqual(store.vehicles.map((v) => v.plateNumber), ['ABC 1234'])
  })

  it("never moves another real account's payment, even with the same email", async () => {
    await links.linkGuestPayments({ user: juan })
    assert.equal(store.payments.get('gcashOther000000001').uid, 'real-2')
    assert.equal(store.violations.get('v-other').violatorUid, null)
  })

  it('a different email gets nothing; guests and unverified accounts get nothing', async () => {
    assert.deepEqual(await links.linkGuestPayments({ user: maria }), { linked: 0 })
    assert.deepEqual(await links.linkGuestPayments({ user: guest }), { linked: 0 })
    assert.deepEqual(await links.linkGuestPayments({ user: { ...juan, email_verified: false } }), { linked: 0 })
    assert.equal(store.payments.get('gcashGuest000000001').uid, 'anon-1')
  })

  it('running it again links nothing new', async () => {
    await links.linkGuestPayments({ user: juan })
    assert.deepEqual(await links.linkGuestPayments({ user: juan }), { linked: 0 })
    assert.equal(store.vehicles.length, 1)
  })
})

describe('GCash paid while signed in', () => {
  it('is linked straight away; a guest payment waits for the email match', async () => {
    const store = memoryStore()
    store.attempts.set('att-signed-in', { uid: 'juan', isGuest: false, status: 'paid', paymentId: 'gcashSignedIn0000001' })
    store.payments.set('gcashSignedIn0000001', { violationId: 'v-other', method: 'GCash', status: 'pending', uid: 'juan' })
    const links = createAccountLinks({ store, auth, now: () => NOW })

    assert.equal(await links.linkPaidAttempt('att-signed-in'), 'linked')
    assert.equal(store.violations.get('v-other').violatorUid, 'juan')
    assert.equal(store.violations.get('v-other').violatorName, 'Juan Dela Cruz')
    assert.equal(await links.linkPaidAttempt('att-guest'), 'skipped')
  })
})
