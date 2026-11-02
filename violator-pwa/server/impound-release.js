// Online impound payments: paid = verified + released right away, with no
// Payment Verification step, the same as the admin's cash impound payments
// (Mira's lib/onsitePayment.ts: recordOnsitePayment and
// syncImpoundRecordReleased, team decision 2026-11-01). Clamp payments are
// not affected: they still wait in Payment Verification.
//
// This file only builds the fields; completePayment() in
// server/firestore-store.js writes them in one transaction. The OR number
// comes from the same series as the cashier's (counters/orNumber), and the
// GCash convenience fee stays separate from impoundFeePaid.

export const ONLINE_STAFF = 'PayMongo (online)'
export const ONLINE_ROLE = 'violator-app'

export function isImpoundPayment(attempt, violation) {
  return attempt?.chargeType === 'Impound' || String(violation?.enforcementType ?? '').toLowerCase() === 'impounded'
}

// `serverTime` is FieldValue.serverTimestamp() (tests pass a marker).
// → { violation, payment, releaseLog, impoundRecord } for the four writes.
export function impoundReleaseWrites({ attempt, attemptId, violation, patch, referenceNumber, orNumber = null, releaseOrderId, serverTime }) {
  const impoundFee = Number(attempt.impoundFee ?? attempt.fineAmount ?? 0)
  const released = {
    verifiedAt: serverTime,
    verifiedBy: ONLINE_STAFF,
    verifiedByRole: ONLINE_ROLE,
    releaseOrderId,
  }

  return {
    // violations/{id} (update)
    violation: {
      paymentStatus: 'Verified',
      verificationStatus: 'Verified',
      ...released,
      releaseStatus: 'Released',
      releasedAt: serverTime,
      releasedBy: ONLINE_STAFF,
      releaseDurationMinutes: 0,
      impoundStatus: 'Released',
      paymentMethod: 'GCash',
      paymentReference: referenceNumber,
      referenceNumber,
      orNumber,
      impoundFeePaid: impoundFee,
      totalPaid: attempt.totalAmount,
      paymentLocation: 'Online',
      paidAt: patch.paidAt,
      updatedAt: serverTime,
      updatedBy: ONLINE_STAFF,
    },

    // payments/{new} (create)
    payment: {
      violationId: attempt.violationId,
      cin: attempt.cin,
      uovrNo: violation.uovrNo ?? null,
      plateNo: attempt.plateNo,
      // Filled in when the payment joins an account (server/account-links.js).
      violatorUid: null,
      guestId: attempt.isGuest ? attempt.uid : null,
      fineAmount: 0,
      impoundFee,
      chargeType: 'Impound',
      amount: impoundFee,
      convenienceFee: attempt.convenienceFee,
      totalAmount: attempt.totalAmount,
      referenceNumber,
      orNumber,
      paymentLocation: 'Online',
      method: 'GCash',
      status: 'Verified',
      verificationStatus: 'Verified',
      ...released,
      recordedBy: 'Violator app (GCash)',
      recordedByRole: ONLINE_ROLE,
      paidAt: patch.paidAt,
      createdAt: serverTime,
      // Ours, as on every online payment (see completePayment()).
      uid: attempt.forOther ? null : attempt.uid,
      checkoutAttemptId: attemptId,
      paymongoPaymentId: patch.paymongoPaymentId,
      livemode: patch.livemode,
    },

    // releaseLog/{new} (create)
    releaseLog: {
      orderId: releaseOrderId,
      violationId: attempt.violationId,
      cin: attempt.cin,
      uovrNo: violation.uovrNo ?? null,
      plateNo: attempt.plateNo,
      clampId: null,
      location: violation.location ?? null,
      chargeType: 'Impound',
      releasedBy: ONLINE_STAFF,
      releasedByRole: ONLINE_ROLE,
      releaseDurationMinutes: 0,
      totalPaid: attempt.totalAmount,
      releasedAt: serverTime,
    },

    // impoundRecords/{id} (update), so the car leaves Vehicles in Yard.
    impoundRecord: {
      status: 'Released',
      paymentStatus: 'Verified',
      referenceNumber,
      orNumber,
      releaseOrderId,
      // The impound fee only; the GCash convenience fee is on the payment.
      amountPaid: impoundFee,
      paidAt: patch.paidAt,
      releasedAt: serverTime,
      releasedBy: ONLINE_STAFF,
      updatedAt: serverTime,
      updatedBy: ONLINE_STAFF,
    },
  }
}
