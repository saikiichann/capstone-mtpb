// Run with: npm run test:server
// Impound desk QR (/pay-impound): plate number + last 4 of the OVR No. find
// the unpaid impound, and give a 30-minute pass to that one violation.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const { createImpoundAccess } = await import('../impound-access.js')
const { createViolationAccess, publicViolation, IMPOUND_NOT_FOUND_MESSAGE } = await import('../violation-access.js')
const { normalizeViolation } = await import('../../src/firebase/mapping.js')

// Mira's sample record, plus an older unpaid one and a paid one.
const RECORDS = {
  'imp-1': { cin: 'IMP-2026-0007', enforcementType: 'impounded', impoundStatus: 'Impounded', plateNo: 'ABC 1234', vehicleType: 'CAR', vehicleColor: 'White', uovrNo: 'MT-0012345', impoundFee: 2100, impoundLocation: 'Lot A', paymentStatus: 'Unpaid', officerName: 'Juan Dela Cruz', recordedAt: new Date('2026-10-30T01:00:00Z') },
  'imp-old': { cin: 'IMP-2026-0002', enforcementType: 'impounded', impoundStatus: 'Impounded', plateNo: 'ABC-1234', uovrNo: 'MT-0002345', impoundFee: 1500, paymentStatus: 'Unpaid', recordedAt: new Date('2026-09-01T01:00:00Z') },
  'imp-paid': { cin: 'IMP-2026-0005', enforcementType: 'impounded', impoundStatus: 'Released', plateNo: 'XYZ 9999', uovrNo: 'MT-0099999', impoundFee: 1500, paymentStatus: 'Verified', recordedAt: new Date('2026-10-01T01:00:00Z') },
}

function memoryStore() {
  const get = (id) => (RECORDS[id] ? normalizeViolation(id, RECORDS[id]) : null)
  return {
    async listImpoundedViolations() {
      return Object.keys(RECORDS).map(get)
    },
    async getViolationById(id) {
      return get(id)
    },
    async getViolationByCin(cin) {
      return get(Object.keys(RECORDS).find((id) => RECORDS[id].cin === cin))
    },
    async getClampByToken() {
      return null
    },
    async listActivePlates() {
      return []
    },
    async listPaymentPlates() {
      return []
    },
    async hasAttemptFor() {
      return false
    },
  }
}

function setup({ now = Date.now } = {}) {
  const impoundAccess = createImpoundAccess({ secret: 'test-secret', now })
  return createViolationAccess({ store: memoryStore(), impoundAccess })
}

const guest = { uid: 'guest-1', isGuest: true }

const notFound = (err) => err.status === 404 && err.message === IMPOUND_NOT_FOUND_MESSAGE

describe('impound lookup', () => {
  it('finds the unpaid impound by plate and the last 4 of the OVR No.', async () => {
    const { violation } = await setup().impoundLookup({ user: guest, plate: 'abc-1234', ovrLast4: '2345' })
    assert.equal(violation.cin, 'IMP-2026-0007')
  })

  it('matches the plate whatever the spacing or dashes', async () => {
    for (const plate of ['ABC 1234', 'abc1234', ' ABC-1234 ']) {
      const { violation } = await setup().impoundLookup({ user: guest, plate, ovrLast4: '2345' })
      assert.equal(violation.id, 'imp-1', plate)
    }
  })

  it('takes the newest when more than one matches', async () => {
    // Both MT-0012345 and MT-0002345 end in 2345.
    const { violation } = await setup().impoundLookup({ user: guest, plate: 'ABC 1234', ovrLast4: '2345' })
    assert.equal(violation.id, 'imp-1')
  })

  it('gives the same answer for a wrong OVR, an unknown plate or a paid impound', async () => {
    const access = setup()
    await assert.rejects(access.impoundLookup({ user: guest, plate: 'ABC 1234', ovrLast4: '9999' }), notFound)
    await assert.rejects(access.impoundLookup({ user: guest, plate: 'NOPE 000', ovrLast4: '2345' }), notFound)
    await assert.rejects(access.impoundLookup({ user: guest, plate: 'XYZ 9999', ovrLast4: '9999' }), notFound)
  })

  it('asks for exactly 4 OVR characters and a plate', async () => {
    const access = setup()
    for (const input of [{ plate: 'ABC 1234', ovrLast4: '345' }, { plate: 'ABC 1234', ovrLast4: 'MT-0012345' }, { plate: '', ovrLast4: '2345' }]) {
      await assert.rejects(access.impoundLookup({ user: guest, ...input }), (err) => err.status === 400)
    }
  })

  it('shows no officer name for desk impounds', async () => {
    const { violation } = await setup().impoundLookup({ user: guest, plate: 'ABC 1234', ovrLast4: '2345' })
    const shown = publicViolation(violation)
    assert.equal(shown.officerName, '')
    assert.equal(shown.impoundLocation, 'Lot A')
    assert.equal(shown.amountDue, 2100)
    assert.equal('uovrNo' in shown, false)
  })
})

describe('impound pass', () => {
  it('lets the same guest see that violation, and nobody else or anything else', async () => {
    const access = setup()
    const { token } = await access.impoundLookup({ user: guest, plate: 'ABC 1234', ovrLast4: '2345' })
    assert.equal((await access.getViolation({ user: guest, ref: 'imp-1', token })).id, 'imp-1')
    assert.equal((await access.getViolation({ user: guest, ref: 'IMP-2026-0007', token })).id, 'imp-1')
    await assert.rejects(access.getViolation({ user: { uid: 'guest-2', isGuest: true }, ref: 'imp-1', token }), (e) => e.status === 404)
    await assert.rejects(access.getViolation({ user: guest, ref: 'imp-old', token }), (e) => e.status === 404)
  })

  it('stops working after 30 minutes', async () => {
    let clock = Date.parse('2026-11-02T00:00:00Z')
    const access = setup({ now: () => clock })
    const { token } = await access.impoundLookup({ user: guest, plate: 'ABC 1234', ovrLast4: '2345' })
    clock += 29 * 60_000
    assert.equal((await access.getViolation({ user: guest, ref: 'imp-1', token })).id, 'imp-1')
    clock += 2 * 60_000
    await assert.rejects(access.getViolation({ user: guest, ref: 'imp-1', token }), (e) => e.status === 404)
  })

  it('refuses a changed or forged pass', async () => {
    const access = setup()
    const { token } = await access.impoundLookup({ user: guest, plate: 'ABC 1234', ovrLast4: '2345' })
    const forged = createImpoundAccess({ secret: 'wrong-secret' }).issue({ uid: guest.uid, violationId: 'imp-1' }).token
    const swapped = token.replace(/\.[^.]+$/, '.AAAA')
    for (const bad of [forged, swapped, 'imp.', 'imp.abc.def']) {
      await assert.rejects(access.getViolation({ user: guest, ref: 'imp-1', token: bad }), (e) => e.status === 404, bad)
    }
  })
})
