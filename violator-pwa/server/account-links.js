import { normalizePaymentState } from '../src/firebase/mapping.js'
import { normalizePlate, samePlate } from '../src/utils/plates.js'
import { HttpError } from './payments-service.js'

// Checklist P1: payments follow the person into their account.
//
// - GCash paid as a guest: the guest had to give an email. When an account
//   with that same email (verified) signs in, its guest payments move to it
//   (linkGuestPayments). No time limit: the verified email proves who it is.
// - Cash paid at the MTPB office: the slip's QR opens /r/<payment id>. Once
//   MTPB has verified the payment, a signed-in account may add it, within
//   CASH_CLAIM_DAYS of the verification (claimCash).
// - GCash paid while signed in: linked straight away (linkPaidAttempt). If
//   the payer typed someone else's email (paying for the owner), it goes to
//   that email's account instead, never the payer's.
//
// "Linked" means the team's own fields on the payment and the violation are
// filled in: `violatorUid` and `violatorName` (Ian's app writes them as null;
// Mira's Release pages show "Registered" + the name from them), plus our
// `uid` on the payment so Payment History finds it. A field that already
// names another account is never overwritten. The plate also goes on the
// account as a "pending" vehicle from the payment (Marco's option 2): the
// app shows only that account's own violations on it until MTPB approves it.
//
// `store` is server/firestore-store.js, `auth` the Firebase Admin auth
// (tests pass fakes).

export const CASH_CLAIM_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

function toDate(value) {
  if (!value) return null
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const isCash = (payment) => String(payment?.method ?? '').trim().toLowerCase() === 'cash'
const isOwnerAccount = (user) => Boolean(user && !user.isGuest && user.email_verified)

// Whether this cash payment can be added to an account, for the Payment
// Check page and for the claim itself:
//   'not-cash' | 'yours' | 'taken' | 'rejected' | 'verify-first' | 'expired' | 'available'
// `deadline` (ISO) is set once MTPB has verified it.
export function cashClaimState(payment, { uid = null, now = new Date() } = {}) {
  if (!payment || !isCash(payment)) return { state: 'not-cash', deadline: null }
  const owner = payment.violatorUid || null
  if (owner && uid && owner === uid) return { state: 'yours', deadline: null }
  if (owner) return { state: 'taken', deadline: null }

  const status = normalizePaymentState(payment.status ?? payment.verificationStatus)
  if (status === 'rejected') return { state: 'rejected', deadline: null }
  if (status !== 'paid') return { state: 'verify-first', deadline: null }

  const verifiedAt = toDate(payment.verifiedAt) ?? toDate(payment.createdAt)
  const deadline = verifiedAt ? new Date(verifiedAt.getTime() + CASH_CLAIM_DAYS * DAY_MS) : null
  if (deadline && now > deadline) return { state: 'expired', deadline: deadline.toISOString() }
  return { state: 'available', deadline: deadline?.toISOString() ?? null }
}

const CLAIM_ERRORS = {
  'not-cash': [400, 'Only cash payments can be added here.'],
  taken: [409, 'This payment was added to a different MTPB account.'],
  rejected: [409, 'This payment wasn’t accepted by MTPB, so it can’t be added.'],
  'verify-first': [409, 'MTPB hasn’t verified this payment yet. Try again after it’s verified.'],
  expired: [410, 'This payment can no longer be added online. Visit the MTPB office with your receipt and a valid ID.'],
}

// A guest is an anonymous Firebase user: no email, no sign-in provider. A
// deleted user counts as a guest too (anonymous users get cleaned up).
async function isGuestUid(auth, uid) {
  try {
    const user = await auth.getUser(uid)
    return !user.email && (user.providerData?.length ?? 0) === 0
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return true
    throw err
  }
}

export function createAccountLinks({ store, auth, now = () => new Date() }) {
  async function nameOf(uid) {
    const profile = await store.getViolatorProfile(uid)
    return profile?.full_name || ''
  }

  // Puts the plate on the account as pending, unless it's already there.
  async function addVehicle(uid, violationId) {
    const violation = violationId ? await store.getViolationById(violationId) : null
    const plate = normalizePlate(violation?.plateNumber ?? '')
    if (!plate) return 'no-plate'
    const owned = await store.listOwnerVehicles(uid)
    if (owned.some((v) => samePlate(v.plateNumber, plate) && v.verificationStatus !== 'rejected')) {
      return 'already-on-account'
    }
    await store.createVehicle({
      ownerUid: uid,
      plateNumber: plate,
      vehicleType: violation.vehicleType || '',
      make: violation.vehicleMake || '',
      color: violation.vehicleColor || '',
      verificationStatus: 'pending',
      source: 'payment',
      linkedViolationId: violation.id,
      linkedCin: violation.cin || null,
      createdAt: now(),
      createdBy: 'Violator app (payment)',
    })
    return 'added'
  }

  // Links one payment and adds its vehicle. `fromUid` is who the payment
  // belongs to now (the guest), or null for cash payments.
  async function link({ paymentId, attemptId = null, uid, fromUid = null }) {
    const result = await store.linkPaymentToAccount({
      paymentId,
      attemptId,
      uid,
      fromUid,
      name: await nameOf(uid),
      linkedAt: now(),
    })
    if (result.status === 'linked' || result.status === 'already') {
      await addVehicle(uid, result.violationId)
    }
    return result.status
  }

  // Cash slip: "Add to My Account" on /r/<payment id>.
  async function claimCash({ user, paymentId }) {
    if (!isOwnerAccount(user)) throw new HttpError(403, 'Log in with a verified account to add this payment.')
    const id = String(paymentId ?? '').trim()
    const payment = id ? await store.getPaymentById(id) : null
    if (!payment) throw new HttpError(404, 'No payment found for this code.')

    const { state } = cashClaimState(payment, { uid: user.uid, now: now() })
    if (state === 'yours') return { status: 'yours' }
    if (CLAIM_ERRORS[state]) throw new HttpError(CLAIM_ERRORS[state][0], CLAIM_ERRORS[state][1], { state })

    const status = await link({ paymentId: id, uid: user.uid })
    if (status === 'taken') throw new HttpError(409, CLAIM_ERRORS.taken[1], { state: 'taken' })
    // Cash gets no receipt email (the slip is the receipt), but the
    // "vehicle released" email goes to this account's registered email
    // (server/status-notifier.js).
    await store.recordCashClaim(id, {
      uid: user.uid,
      violationId: payment.violationId ?? null,
      cin: payment.cin ?? null,
      plateNo: payment.plateNo ?? null,
      referenceNumber: payment.referenceNumber ?? null,
      claimedAt: now(),
    })
    return { status: 'yours' }
  }

  // After a verified account signs in: the GCash payments made as a guest
  // with this account's email. Also covers the guest who signed up on the
  // same phone (same uid, nothing linked yet). Safe to run every sign-in.
  async function linkGuestPayments({ user }) {
    if (!isOwnerAccount(user) || !user.email) return { linked: 0 }
    const attempts = await store.listPaidAttemptsByEmail(user.email)
    let linked = 0
    for (const attempt of attempts) {
      if (!attempt.paymentId) continue
      if (attempt.uid !== user.uid) {
        // Only payments made as a guest, or by someone who typed this
        // account's email (paying for its owner), move here; never a
        // payment someone made for their own account.
        const sentHere = attempt.forOther === true
        if (!sentHere && (attempt.isGuest === false || !(await isGuestUid(auth, attempt.uid)))) continue
      }
      const status = await link({
        paymentId: attempt.paymentId,
        attemptId: attempt.id,
        uid: user.uid,
        fromUid: attempt.uid,
      })
      if (status === 'linked') linked += 1
    }
    return { linked }
  }

  // Right after a GCash payment is recorded. Paid while signed in for their
  // own account: linked at once. Paid for someone else's email: linked to
  // that account if it exists and is verified, otherwise when it signs in.
  // Guests are linked later by email.
  async function linkPaidAttempt(attemptId) {
    const attempt = await store.getAttempt(attemptId)
    if (!attempt?.paymentId || attempt.isGuest !== false) return 'skipped'
    if (attempt.forOther) {
      const owner = await accountByEmail(attempt.emailLower || attempt.email)
      if (!owner) return 'waiting'
      return link({ paymentId: attempt.paymentId, attemptId: attempt.id, uid: owner.uid, fromUid: attempt.uid })
    }
    return link({ paymentId: attempt.paymentId, attemptId: attempt.id, uid: attempt.uid, fromUid: attempt.uid })
  }

  // A real, verified account with this email, or null.
  async function accountByEmail(email) {
    if (!email) return null
    try {
      const found = await auth.getUserByEmail(String(email).trim().toLowerCase())
      return found.emailVerified && found.email ? found : null
    } catch (err) {
      if (err?.code === 'auth/user-not-found') return null
      throw err
    }
  }

  return { claimCash, linkGuestPayments, linkPaidAttempt }
}
