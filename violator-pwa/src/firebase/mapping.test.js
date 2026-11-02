// Run with: npm test
// Checks the translation layer against documents shaped the way the admin
// app (Mira) and the enforcer app (Ian) actually write them. If one of them
// renames a field or a status word, these are the tests that should fail.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isPaymentSettled,
  normalizeClamp,
  normalizePayment,
  normalizePaymentStatus,
  normalizeViolation,
} from './mapping.js'

describe('violation payment status', () => {
  it('counts Pending Verification and Verified as paid', () => {
    assert.equal(normalizePaymentStatus('Pending Verification'), 'paid')
    assert.equal(normalizePaymentStatus('Verified'), 'paid')
  })

  it('keeps Unpaid, Rejected and a missing value payable', () => {
    for (const value of ['Unpaid', 'Rejected', undefined, '']) {
      assert.equal(normalizePaymentStatus(value), 'unpaid')
      assert.equal(isPaymentSettled(value), false)
    }
  })

  it('stops online payment once the money is in', () => {
    assert.equal(isPaymentSettled('Pending Verification'), true)
    assert.equal(isPaymentSettled('Verified'), true)
  })
})

describe('normalizeViolation', () => {
  // As the enforcer app's ClampingDetailsScreen writes it.
  const fromEnforcer = {
    cin: 'CLMP-2026-0001',
    plateNo: 'ABC 1234',
    vehicleMake: 'Toyota',
    vehicleType: 'Sedan',
    vehicleColor: 'White',
    violationType: 'Illegal Parking',
    enforcementType: 'clamped',
    location: 'Recto Ave.',
    officer: 'Juan Dela Cruz',
    fineAmount: 900,
    photoUrl: 'https://example.supabase.co/violation-photos/1.jpg',
    clampId: 'CL-001',
    recordedAt: '2026-10-01T08:00:00Z',
    paymentStatus: 'Unpaid',
  }

  it('reads the enforcer app field names', () => {
    const v = normalizeViolation('doc1', fromEnforcer)
    assert.equal(v.cin, 'CLMP-2026-0001')
    assert.equal(v.plateNumber, 'ABC 1234')
    assert.equal(v.officerName, 'Juan Dela Cruz')
    assert.equal(v.clampedAt, '2026-10-01T08:00:00Z')
    assert.equal(v.clampId, 'CL-001')
    assert.equal(v.fineAmount, 900)
    assert.equal(v.status, 'clamped')
    assert.equal(v.paymentStatus, 'unpaid')
    assert.deepEqual(v.evidencePhotos, [fromEnforcer.photoUrl])
  })

  it('marks a payment waiting for staff as paid, awaiting verification', () => {
    const v = normalizeViolation('doc1', { ...fromEnforcer, paymentStatus: 'Pending Verification' })
    assert.equal(v.paymentStatus, 'paid')
    assert.equal(v.awaitingVerification, true)
  })

  it('shows the rejection reason only on a rejected payment', () => {
    const rejected = normalizeViolation('doc1', { ...fromEnforcer, paymentStatus: 'Rejected', rejectionReason: 'Wrong amount' })
    assert.equal(rejected.paymentStatus, 'unpaid')
    assert.equal(rejected.rejectionReason, 'Wrong amount')

    const verified = normalizeViolation('doc1', { ...fromEnforcer, paymentStatus: 'Verified', rejectionReason: 'Old note' })
    assert.equal(verified.rejectionReason, '')
  })

  it('treats impounding as impounded', () => {
    assert.equal(normalizeViolation('doc1', { ...fromEnforcer, enforcementType: 'Impounding' }).status, 'impounded')
  })

  it('falls back to the document id for the CIN and to 0 for a bad fine', () => {
    const v = normalizeViolation('CLMP-2026-0002', { fineAmount: 'n/a' })
    assert.equal(v.cin, 'CLMP-2026-0002')
    assert.equal(v.fineAmount, 0)
    assert.deepEqual(v.evidencePhotos, [])
  })

  it('returns null for a missing document', () => {
    assert.equal(normalizeViolation('x', undefined), null)
  })
})

describe('clamp state (derived like the admin QR Management)', () => {
  const state = (data) => normalizeClamp('clamp1', data).status

  it('follows the lifecycle fields in order', () => {
    assert.equal(state({ deployedAt: 1, paidAt: 2, readyAt: 3, releasedAt: 4 }), 'released')
    assert.equal(state({ deployedAt: 1, paidAt: 2, readyAt: 3 }), 'ready_for_release')
    assert.equal(state({ deployedAt: 1, paidAt: 2 }), 'paid')
    assert.equal(state({ deployedAt: 1 }), 'for_payment')
    assert.equal(state({ cin: 'CLMP-2026-0001' }), 'for_payment')
    assert.equal(state({ currentViolationId: 'v1' }), 'for_payment')
  })

  it('ignores a stale stored status when lifecycle fields exist', () => {
    assert.equal(state({ status: 'available', cin: 'CLMP-2026-0001' }), 'for_payment')
    assert.equal(state({ status: 'unpaid', deployedAt: null, cin: '' }), 'waiting')
  })

  it('uses the stored status on clamps without lifecycle fields', () => {
    assert.equal(state({ status: 'In Use' }), 'for_payment')
    assert.equal(state({}), 'waiting')
    assert.equal(state({ status: 'something new' }), 'unknown')
  })

  it('reads the current violation', () => {
    const clamp = normalizeClamp('clamp1', { clampId: 'CL-001', currentViolationId: 'v1', cin: 'CLMP-2026-0001' })
    assert.equal(clamp.clampNumber, 'CL-001')
    assert.equal(clamp.violationId, 'v1')
    assert.equal(clamp.violationCin, 'CLMP-2026-0001')
  })
})

describe('normalizePayment', () => {
  // As the PWA's backend writes it into the admin app's payments.
  const gcash = {
    referenceNumber: 'REF-2026-00011',
    method: 'GCash',
    status: 'pending',
    amount: 900,
    convenienceFee: 23.06,
    totalAmount: 923.06,
    violationId: 'v1',
    cin: 'CLMP-2026-0001',
    uid: 'user1',
  }

  it('shows a payment waiting for staff as paid, awaiting verification', () => {
    const p = normalizePayment('random-id', gcash)
    assert.equal(p.referenceNumber, 'REF-2026-00011')
    assert.equal(p.status, 'verifying')
    assert.equal(p.isPaid, true)
    assert.equal(p.awaitingVerification, true)
    assert.equal(p.fineAmount, 900)
    assert.equal(p.convenienceFee, 23.06)
    assert.equal(p.amount, 923.06)
  })

  it('lets the staff decision win over the stored status', () => {
    assert.equal(normalizePayment('id', { ...gcash, verificationStatus: 'Verified' }).status, 'paid')
    const rejected = normalizePayment('id', { ...gcash, verificationStatus: 'Rejected' })
    assert.equal(rejected.status, 'rejected')
    assert.equal(rejected.isPaid, false)
  })

  it('falls back to the document id for the reference number', () => {
    assert.equal(normalizePayment('REF-2026-00001', { status: 'paid', amount: 500 }).referenceNumber, 'REF-2026-00001')
  })
})

describe('impound fee', () => {
  it('charges the clamp fine while only subject to impound', () => {
    const v = normalizeViolation('v1', { cin: 'CLMP-1', fineAmount: 900, impoundStatus: 'Subject to Impound', impoundFee: 2000 })
    assert.equal(v.impoundStatus, 'subject_to_impound')
    assert.equal(v.impoundFee, 0)
    assert.equal(v.amountDue, 900)
  })

  it('replaces the fine with the impound fee once impounded', () => {
    const v = normalizeViolation('v2', { cin: 'CLMP-2', fineAmount: 900, impoundStatus: 'Impounded', impoundFee: 2000 })
    assert.equal(v.impoundStatus, 'impounded')
    assert.equal(v.impoundFee, 2000)
    assert.equal(v.amountDue, 2000)
    assert.equal(v.fineAmount, 900)
    assert.equal(v.status, 'impounded')
  })

  it('uses ₱2,000 when an impounded record has no fee saved', () => {
    const v = normalizeViolation('v3', { cin: 'CLMP-3', fineAmount: 900, impoundStatus: 'Impounded' })
    assert.equal(v.amountDue, 2000)
  })

  it('keeps the fine when nothing about impounding is recorded', () => {
    const v = normalizeViolation('v4', { cin: 'CLMP-4', fineAmount: 750, impoundStatus: 'None' })
    assert.equal(v.impoundStatus, 'none')
    assert.equal(v.amountDue, 750)
  })
})

describe('overdue clamp fee (₱2,000 after 24 hours)', () => {
  const H = 3600000
  const now = Date.parse('2026-11-02T12:00:00Z')
  const clamp = (extra) => ({ cin: 'CLMP-9', enforcementType: 'clamped', fineAmount: 900, paymentStatus: 'Unpaid', ...extra })

  it('charges the fine within 24 hours', () => {
    const v = normalizeViolation('c1', clamp({ recordedAt: new Date(now - 23 * H) }), now)
    assert.equal(v.overdue, false)
    assert.equal(v.overdueFee, 0)
    assert.equal(v.amountDue, 900)
  })

  it('replaces the fine with a fixed ₱2,000 after 24 hours', () => {
    const v = normalizeViolation('c2', clamp({ recordedAt: new Date(now - 25 * H) }), now)
    assert.equal(v.overdue, true)
    assert.equal(v.overdueFee, 2000)
    assert.equal(v.amountDue, 2000)
    assert.equal(v.fineAmount, 900)
    assert.equal(v.status, 'clamped')
  })

  it('stays ₱2,000 at 48+ hours and for several violations', () => {
    const v = normalizeViolation('c3', clamp({ fineAmount: 1800, recordedAt: new Date(now - 60 * H) }), now)
    assert.equal(v.amountDue, 2000)
  })

  it("uses the enforcer app's gracePeriodEnd when saved", () => {
    const v = normalizeViolation(
      'c4',
      clamp({ recordedAt: new Date(now - 30 * H), gracePeriodEnd: { seconds: (now + H) / 1000 } }),
      now,
    )
    assert.equal(v.overdue, false)
    assert.equal(v.amountDue, 900)
  })

  it('is not overdue once paid; a payment at the overdue rate still shows ₱2,000', () => {
    const paidFine = normalizeViolation(
      'c5',
      clamp({ recordedAt: new Date(now - 30 * H), paymentStatus: 'Pending Verification', totalPaid: 925 }),
      now,
    )
    assert.equal(paidFine.overdue, false)
    assert.equal(paidFine.amountDue, 900)
    const paidOverdue = normalizeViolation(
      'c6',
      clamp({ recordedAt: new Date(now - 30 * H), paymentStatus: 'Verified', overdueFeePaid: 2000 }),
      now,
    )
    assert.equal(paidOverdue.overdue, false)
    assert.equal(paidOverdue.amountDue, 2000)
  })

  it('never applies to impounds: the impound fee is charged instead', () => {
    const v = normalizeViolation(
      'i1',
      { cin: 'IMP-1', enforcementType: 'impounded', impoundStatus: 'Impounded', impoundFee: 4100, fineAmount: 0, recordedAt: new Date(now - 50 * H) },
      now,
    )
    assert.equal(v.overdue, false)
    assert.equal(v.overdueFee, 0)
    assert.equal(v.amountDue, 4100)
  })
})

describe('payment OR number', () => {
  it('reads the Official Receipt number (cash and online share one series)', () => {
    assert.equal(normalizePayment('p1', { referenceNumber: 'REF-2026-00002', orNumber: 'OR-2026-00001', status: 'pending', totalAmount: 922.5 }).orNumber, 'OR-2026-00001')
    assert.equal(normalizePayment('p2', { referenceNumber: 'REF-2026-00003', status: 'pending', totalAmount: 922.5 }).orNumber, '')
  })
})
