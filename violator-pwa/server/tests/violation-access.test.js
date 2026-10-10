// Run with: npm run test:server
// Who may see a violation (checklist S2): the clamp's scanner, the vehicle's
// owner, or whoever paid it. Nobody else, not even by guessing its number.
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

const { createViolationAccess, publicViolation } = await import('../violation-access.js')
const { normalizeClamp, normalizeViolation } = await import('../../src/firebase/mapping.js')

function memoryStore() {
  const violations = new Map([
    ['v-live', { cin: 'CLMP-2026-0009', plateNo: 'ABC 1234', fineAmount: 900, paymentStatus: 'Unpaid', officer: 'Juan Dela Cruz', officerUid: 'staff-1', locationCoords: { lat: 14.6, lng: 120.98 }, recordedAt: new Date('2026-10-11T01:00:00Z') }],
    ['v-other', { cin: 'CLMP-2026-0010', plateNo: 'XYZ-9999', fineAmount: 900, paymentStatus: 'Unpaid' }],
  ])
  const clamps = new Map([
    ['clamp-1', { scanToken: 'tok-1', clampId: 'CL-001', currentViolationId: 'v-live', cin: 'CLMP-2026-0009', deployedAt: new Date() }],
    ['clamp-2', { scanToken: 'tok-2', clampId: 'CL-002', status: 'available' }],
  ])
  const vehicles = [
    { ownerUid: 'owner-1', plateNumber: 'ABC1234', verificationStatus: 'active' },
    { ownerUid: 'owner-2', plateNumber: 'XYZ 9999', verificationStatus: 'pending' },
  ]
  const attempts = [{ uid: 'payer-1', violationId: 'v-other' }]
  const get = (id) => (violations.has(id) ? normalizeViolation(id, violations.get(id)) : null)
  return {
    async getViolationById(id) {
      return get(id)
    },
    async getViolationByCin(cin) {
      const id = [...violations.keys()].find((k) => violations.get(k).cin === cin)
      return id ? get(id) : null
    },
    async getClampByToken(token) {
      const entry = [...clamps.entries()].find(([, c]) => c.scanToken === token)
      return entry ? normalizeClamp(entry[0], entry[1]) : null
    },
    async listActivePlates(uid) {
      return vehicles.filter((v) => v.ownerUid === uid && v.verificationStatus === 'active').map((v) => v.plateNumber)
    },
    async listViolationsForPlates(plates) {
      const key = (p) => p.replace(/[\s-]/g, '')
      return [...violations.keys()].filter((id) => plates.some((p) => key(p) === key(violations.get(id).plateNo))).map(get)
    },
    async hasAttemptFor(uid, violationId) {
      return attempts.some((a) => a.uid === uid && a.violationId === violationId)
    },
  }
}

const guest = { uid: 'guest-1', isGuest: true }
const owner = { uid: 'owner-1', isGuest: false, email_verified: true }
const unverifiedOwner = { uid: 'owner-1', isGuest: false, email_verified: false }
const stranger = { uid: 'someone', isGuest: false, email_verified: true }

describe('violation access', () => {
  let access
  beforeEach(() => {
    access = createViolationAccess({ store: memoryStore() })
  })

  it('scanning a sticker shows the clamp and its violation, without the private fields', async () => {
    const result = await access.scan({ token: 'tok-1' })
    assert.equal(result.found, true)
    assert.equal(result.clampNumber, 'CL-001')
    assert.equal(result.status, 'for_payment')
    assert.equal(result.violation.id, 'v-live')
    assert.equal(result.violation.plateNumber, 'ABC 1234')
    assert.equal(result.violation.clampedAt, '2026-10-11T01:00:00.000Z', 'dates arrive as text')
    assert.equal(result.violation.raw, undefined, 'the raw document stays on the server')
    assert.ok(!JSON.stringify(result).includes('staff-1'), 'officer uid not sent')
    assert.ok(!JSON.stringify(result).includes('120.98'), 'GPS not sent')
  })

  it('a wrong token or an empty clamp shows nothing', async () => {
    assert.equal((await access.scan({ token: 'nope' })).found, false)
    const empty = await access.scan({ token: 'tok-2' })
    assert.equal(empty.found, true)
    assert.equal(empty.violation, null)
  })

  it('a guest sees the violation only with the token of the clamp it is on', async () => {
    const v = await access.getViolation({ user: guest, ref: 'v-live', token: 'tok-1' })
    assert.equal(v.id, 'v-live')
    // By violation number too, as old links use it.
    assert.equal((await access.getViolation({ user: guest, ref: 'CLMP-2026-0009', token: 'tok-1' })).id, 'v-live')
    for (const token of [undefined, 'tok-2', 'nope']) {
      await assert.rejects(access.getViolation({ user: guest, ref: 'v-live', token }), (e) => e.status === 404)
    }
  })

  it('guessing a violation number gives "not found", same as one that does not exist', async () => {
    await assert.rejects(access.getViolation({ user: stranger, ref: 'CLMP-2026-0010' }), (e) => e.status === 404)
    await assert.rejects(access.getViolation({ user: stranger, ref: 'CLMP-2026-9999' }), (e) => e.status === 404)
  })

  it('an owner sees violations on their verified vehicles, however the plate was typed', async () => {
    assert.equal((await access.getViolation({ user: owner, ref: 'v-live' })).id, 'v-live')
    await assert.rejects(access.getViolation({ user: owner, ref: 'v-other' }), (e) => e.status === 404)
    const mine = await access.listMine({ user: owner })
    assert.deepEqual(mine.map((v) => v.id), ['v-live'])
  })

  it('a vehicle still pending verification shows nothing, and so does an unverified email', async () => {
    assert.deepEqual(await access.listMine({ user: { uid: 'owner-2', email_verified: true } }), [])
    await assert.rejects(access.getViolation({ user: unverifiedOwner, ref: 'v-live' }), (e) => e.status === 404)
    await assert.rejects(access.listMine({ user: unverifiedOwner }), (e) => e.status === 403)
    await assert.rejects(access.listMine({ user: guest }), (e) => e.status === 403)
  })

  it('whoever paid a violation can still open it', async () => {
    assert.equal((await access.getViolation({ user: { uid: 'payer-1', isGuest: true }, ref: 'v-other' })).id, 'v-other')
  })

  it('publicViolation keeps only the fields the app shows', () => {
    const view = publicViolation(normalizeViolation('v', { cin: 'C', plateNo: 'P', orNumber: 'OR-1', verifiedBy: 'Staff' }))
    assert.ok(!('raw' in view))
    assert.ok(!JSON.stringify(view).includes('OR-1'))
  })
})
