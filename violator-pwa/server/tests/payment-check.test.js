// Run with: npm run test:server
// The cash slip's QR page: genuine slips show their status, nothing personal
// is revealed, and made-up codes find nothing.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const { createPaymentCheck } = await import('../payment-check.js')
const { normalizeViolation } = await import('../../src/firebase/mapping.js')

const CASH_ID = 'q7Lm2XvR9tKbW4nYc8Ps'
const GCASH_ID = 'Ab3Cd4Ef5Gh6Ij7Kl8Mn'

// Shaped like Mira's recordCashPayment() and the PWA's GCash payments.
const payments = new Map([
  [CASH_ID, {
    violationId: 'v1', cin: 'CLMP-2026-0009', amount: 900, convenienceFee: 0, totalAmount: 900, cashReceived: 1000,
    referenceNumber: 'REF-2026-00016', orNumber: '7654321', method: 'Cash', status: 'pending',
    recordedBy: 'Maria Finance', createdAt: new Date('2026-10-11T02:24:00Z'),
  }],
  [GCASH_ID, {
    violationId: 'v1', cin: 'CLMP-2026-0009', plateNo: 'ABC 1234', amount: 900, totalAmount: 923.06,
    referenceNumber: 'REF-2026-00017', method: 'GCash', status: 'Verified', verificationStatus: 'Verified',
    uid: 'user-1', email: 'payer@example.com', mobileNumber: '09171234567', paidAt: new Date('2026-10-11T03:00:00Z'),
  }],
])
const store = {
  async getPaymentById(id) {
    return payments.get(id) ?? null
  },
  async getViolationById(id) {
    return id === 'v1' ? normalizeViolation('v1', { cin: 'CLMP-2026-0009', plateNo: 'ABC 1234' }) : null
  },
}

describe('payment check (cash slip QR)', () => {
  const check = createPaymentCheck({ store }).check

  it('shows a genuine cash slip waiting for verification, with the plate from its violation', async () => {
    assert.deepEqual(await check(CASH_ID), {
      referenceNumber: 'REF-2026-00016',
      method: 'Cash',
      amount: 900,
      paidAt: '2026-10-11T02:24:00.000Z',
      status: 'verifying',
      violationCin: 'CLMP-2026-0009',
      plateNumber: 'ABC 1234',
    })
  })

  it('shows a verified payment as paid, and nothing personal', async () => {
    const result = await check(GCASH_ID)
    assert.equal(result.status, 'paid')
    const text = JSON.stringify(result)
    for (const secret of ['payer@example.com', '09171234567', 'user-1', 'Maria Finance', '7654321']) {
      assert.ok(!text.includes(secret), `does not reveal ${secret}`)
    }
  })

  it('made-up or malformed codes find nothing', async () => {
    for (const code of ['ZZZZZZZZZZZZZZZZZZZZ', 'REF-2026-00016', '../payments', '', undefined]) {
      await assert.rejects(check(code), (e) => e.status === 404, String(code))
    }
  })
})
