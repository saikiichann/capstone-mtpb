import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import {
  CLAMP_TOKEN_FIELD,
  isPaymentSettled,
  normalizeClamp,
  normalizeViolation,
  PLATE_FIELDS,
} from '../src/firebase/mapping.js'
import { COLLECTIONS, PAYMENT_COUNTER_ID } from '../src/firebase/schema.js'
import { plateSpellings } from '../src/utils/plates.js'
import { config } from './config.js'

// Firestore adapter for the payment service, using the Firebase Admin SDK.
// Admin writes skip the security rules, which is why payments can only be
// written from here and not from the app.
//
// The admin app (Mira's) owns `payments`, `violations` and the reference
// counter, so everything written there copies what its own cash payments
// write (admin-web/src/pages/finance/PendingPayments.tsx, recordCashPayment).

function adminApp() {
  if (getApps().length) return getApps()[0]
  return initializeApp({ credential: cert(JSON.parse(config.firebaseServiceAccount)) })
}

export function adminAuth() {
  return getAuth(adminApp())
}

function millis(value) {
  if (!value) return 0
  if (typeof value?.toMillis === 'function') return value.toMillis()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function manilaYear(date) {
  return Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Asia/Manila' }).format(date))
}

export function createFirestoreStore() {
  const db = getFirestore(adminApp())
  const attempts = db.collection(COLLECTIONS.checkoutAttempts)
  const payments = db.collection(COLLECTIONS.payments)
  const counterRef = db.collection(COLLECTIONS.counters).doc(PAYMENT_COUNTER_ID)

  return {
    // Violations go through the same field mapping as the app (mapping.js),
    // so a payment records the right plate and officer even though the admin
    // app calls them `plateNo` and `officer`.
    async getViolationById(violationId) {
      if (!violationId) return null
      const doc = await db.collection(COLLECTIONS.violations).doc(violationId).get()
      return doc.exists ? normalizeViolation(doc.id, doc.data()) : null
    },

    // The QR id on a clamp is reused for its next violation, so this picks
    // the one that still has to be paid (newest first).
    async getViolationByCin(cin) {
      const snap = await db.collection(COLLECTIONS.violations).where('cin', '==', cin).get()
      if (snap.empty) return null
      const all = snap.docs.map((doc) => normalizeViolation(doc.id, doc.data()))
      const unpaid = all.filter((v) => !isPaymentSettled(v.raw.paymentStatus))
      const pool = unpaid.length ? unpaid : all
      return pool.sort((a, b) => millis(b.clampedAt) - millis(a.clampedAt))[0]
    },

    async getViolatorProfile(uid) {
      const doc = await db.collection(COLLECTIONS.violators).doc(uid).get()
      return doc.exists ? doc.data() : null
    },

    // ---- Reads for violation-access.js (checklist S2). The app no longer
    // reads clamps and violations itself; these run here instead, and
    // violation-access.js decides who may see what.

    // The clamp whose QR sticker carries this scan token. Only the token
    // finds a clamp (Marco's choice: clamp numbers in links must not work).
    async getClampByToken(token) {
      if (!token) return null
      const snap = await db.collection(COLLECTIONS.clamps).where(CLAMP_TOKEN_FIELD, '==', token).limit(1).get()
      return snap.empty ? null : normalizeClamp(snap.docs[0].id, snap.docs[0].data())
    },

    // Plates of this owner's vehicles MTPB has verified ("active").
    async listActivePlates(ownerUid) {
      const snap = await db.collection(COLLECTIONS.vehicles).where('ownerUid', '==', ownerUid).get()
      return snap.docs
        .map((doc) => doc.data())
        .filter((v) => (v.verificationStatus ?? 'pending') === 'active' && v.plateNumber)
        .map((v) => v.plateNumber)
    },

    // Violations on any of these plates, however the enforcer app spelled
    // them. One "in" query (max 30 values) per plate field name, merged.
    async listViolationsForPlates(plates) {
      const spellings = [...new Set(plates.flatMap(plateSpellings))]
      const chunks = []
      for (let i = 0; i < spellings.length; i += 30) chunks.push(spellings.slice(i, i + 30))
      const snaps = await Promise.all(
        PLATE_FIELDS.flatMap((field) =>
          chunks.map((chunk) => db.collection(COLLECTIONS.violations).where(field, 'in', chunk).get()),
        ),
      )
      const byId = new Map()
      for (const snap of snaps) for (const doc of snap.docs) byId.set(doc.id, normalizeViolation(doc.id, doc.data()))
      return [...byId.values()]
    },

    // Whether this person started a payment for this violation (so they can
    // still open it, and its receipt details, after paying).
    async hasAttemptFor(uid, violationId) {
      const snap = await attempts.where('uid', '==', uid).select('violationId').get()
      return snap.docs.some((doc) => doc.get('violationId') === violationId)
    },

    // Every Pay Now press gets its own attempt. No reference number yet:
    // that's only handed out once PayMongo says the money is in.
    async createAttempt(data) {
      const ref = attempts.doc()
      await ref.set(data)
      return ref.id
    },

    // How many Pay Now presses this person made since `since` (the payment
    // rate limit). Only filtered by uid, so Firestore needs no extra index;
    // the time is compared here. Reads just the createdAt field.
    async countRecentAttempts(uid, since) {
      const snap = await attempts.where('uid', '==', uid).select('createdAt').get()
      return snap.docs.filter((doc) => {
        const created = doc.get('createdAt')
        const time = typeof created?.toDate === 'function' ? created.toDate() : new Date(created)
        return time >= since
      }).length
    },

    async getAttempt(attemptId) {
      if (!attemptId) return null
      const doc = await attempts.doc(attemptId).get()
      return doc.exists ? { ...doc.data(), id: doc.id } : null
    },

    // Payments MTPB staff verified or rejected since `since` that were made in
    // this app (they carry our checkoutAttemptId). Read only; one range on a
    // single field, so Firestore needs no extra index. For status-notifier.js.
    async listDecidedAppPayments(since) {
      const snap = await payments.where('verifiedAt', '>=', since).get()
      return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id })).filter((p) => p.checkoutAttemptId)
    },

    async updateAttempt(attemptId, patch, { onlyIfStatus } = {}) {
      const ref = attempts.doc(attemptId)
      if (!onlyIfStatus) {
        await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() })
        return
      }
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref)
        if (doc.exists && doc.data().status === onlyIfStatus) {
          tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() })
        }
      })
    },

    // Records a confirmed online payment the way the admin app records cash:
    // the next REF number from its counter, a `payments` document waiting for
    // verification, and the violation moved to "Pending Verification".
    // Finance staff then verify it in the admin app, which also updates the
    // clamp and the release status.
    //
    // Returns 'paid', 'already-paid' (this attempt was recorded before),
    // 'duplicate' (the violation was already paid some other way), 'review'
    // (the violation is gone) or 'unknown'.
    async completePayment(attemptId, patch) {
      return db.runTransaction(async (tx) => {
        const attemptRef = attempts.doc(attemptId)
        const attemptDoc = await tx.get(attemptRef)
        if (!attemptDoc.exists) return 'unknown'
        const attempt = attemptDoc.data()
        if (attempt.status === 'paid') return 'already-paid'

        const violationRef = db.collection(COLLECTIONS.violations).doc(attempt.violationId)
        const violationDoc = await tx.get(violationRef)
        const violation = violationDoc.data() ?? {}
        const counterDoc = await tx.get(counterRef)
        const stamp = { updatedAt: FieldValue.serverTimestamp() }

        // Money came in for a violation that no longer exists: keep it on
        // the attempt for someone to sort out by hand.
        if (!violationDoc.exists) {
          tx.update(attemptRef, { ...patch, ...stamp, status: 'review', failureReason: 'violation_missing' })
          return 'review'
        }
        if (isPaymentSettled(violation.paymentStatus)) {
          tx.update(attemptRef, { ...patch, ...stamp, status: 'duplicate' })
          return 'duplicate'
        }

        const next = Number(counterDoc.exists ? (counterDoc.data().lastValue ?? 0) : 0) + 1
        const referenceNumber = `REF-${manilaYear(patch.paidAt)}-${String(next).padStart(5, '0')}`
        const paymentRef = payments.doc()

        tx.set(counterRef, { lastValue: next, prefix: 'REF', ...stamp }, { merge: true })

        tx.set(paymentRef, {
          violationId: attempt.violationId,
          cin: attempt.cin,
          plateNo: attempt.plateNo,
          amount: attempt.fineAmount,
          convenienceFee: attempt.convenienceFee,
          totalAmount: attempt.totalAmount,
          referenceNumber,
          method: 'GCash',
          status: 'pending',
          recordedBy: 'Violator app (GCash)',
          paidAt: patch.paidAt,
          createdAt: FieldValue.serverTimestamp(),
          // Not used by the admin app. `uid` lets the violator find their
          // own payments; the PayMongo ids let finance staff match this
          // record against the PayMongo dashboard; `livemode: false` puts
          // "not valid as an official receipt" on test-mode receipts.
          uid: attempt.uid,
          checkoutAttemptId: attemptId,
          paymongoPaymentId: patch.paymongoPaymentId,
          livemode: patch.livemode,
        })

        tx.update(violationRef, {
          paymentStatus: 'Pending Verification',
          paymentMethod: 'GCash',
          paymentReference: referenceNumber,
          referenceNumber,
          totalPaid: attempt.totalAmount,
          paidAt: patch.paidAt,
          updatedBy: 'Violator app (GCash)',
          ...stamp,
        })

        tx.update(attemptRef, { ...patch, ...stamp, status: 'paid', referenceNumber, paymentId: paymentRef.id })
        return 'paid'
      })
    },
  }
}
