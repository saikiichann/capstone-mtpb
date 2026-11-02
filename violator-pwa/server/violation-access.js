import { isPaymentSettled } from '../src/firebase/mapping.js'
import { samePlate } from '../src/utils/plates.js'
import { isImpoundToken } from './impound-access.js'
import { HttpError } from './payments-service.js'

// Who may see a violation (checklist S2). The app used to read clamps and
// violations straight from Firestore, which meant any guest sign-in could read
// all of them (plates, places, times, officers). Now only this server reads
// them, and a violation is shown to:
// - someone who scanned the QR sticker of the clamp it is on (they send the
//   sticker's scan token along),
// - its owner: a signed-in, verified account with a verified ("active")
//   vehicle of that plate,
// - someone who found it at the impound desk QR with its plate number and
//   the last 4 of the OVR No. (a 30-minute pass, server/impound-access.js),
// - whoever started a payment for it (so receipts and the paid violation
//   stay visible after the clamp is released),
// - the account it was paid to (violatorUid, server/account-links.js),
// - while unpaid, an account that has its plate from an earlier payment, if
//   it was recorded after that plate joined the account (checklist P1:
//   they can pay the new one in the app). Once paid, only the payer's.
// Anyone else gets "not found", whether or not it exists, so violation
// numbers can't be guessed.
//
// `store` is server/firestore-store.js (tests pass an in-memory one).

const NOT_FOUND = () => new HttpError(404, 'Violation not found.')
// The same answer whether the plate was never impounded, the OVR digits are
// wrong or it's already paid, so nobody can find out which.
export const IMPOUND_NOT_FOUND_MESSAGE = 'No unpaid impound found for this plate.'

// Firestore Timestamps don't survive JSON; the app reads ISO strings.
export function iso(value) {
  if (!value) return null
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

// What the app gets: the mapped fields only. `raw` (the whole document, with
// staff names, GPS and OR numbers) stays on the server.
export function publicViolation(v) {
  if (!v) return null
  return {
    id: v.id,
    cin: v.cin,
    clampId: v.clampId,
    plateNumber: v.plateNumber,
    // Not for impounds: the impound desk page is open to anyone with the
    // ticket, so it shows no personal data (Data Privacy Act).
    officerName: isDeskImpound(v) ? '' : v.officerName,
    clampedAt: iso(v.clampedAt),
    impoundLocation: v.impoundLocation,
    fineAmount: v.fineAmount,
    impoundStatus: v.impoundStatus,
    impoundFee: v.impoundFee,
    amountDue: v.amountDue,
    violationType: v.violationType,
    location: v.location,
    paymentStatus: v.paymentStatus,
    awaitingVerification: v.awaitingVerification,
    rejectionReason: v.rejectionReason,
    referenceNumber: v.referenceNumber,
    paymentMethod: v.paymentMethod,
    paidAt: iso(v.paidAt),
    status: v.status,
    enforcementType: v.enforcementType,
    vehicleMake: v.vehicleMake,
    vehicleType: v.vehicleType,
    vehicleColor: v.vehicleColor,
    evidencePhotos: v.evidencePhotos,
  }
}

// Recorded by the impounding staff (Add Impound Record), not by an enforcer.
const isDeskImpound = (v) => String(v?.enforcementType ?? '').toLowerCase() === 'impounded'

// Owners need a verified email; guests (anonymous) never own vehicles.
const isOwnerAccount = (user) => Boolean(user && !user.isGuest && user.email_verified)

// The violation the clamp is carrying now: by its id when the clamp has one,
// otherwise by the clamp's violation number.
function clampCarries(clamp, violation) {
  if (!clamp || !violation) return false
  if (clamp.violationId) return clamp.violationId === violation.id
  return Boolean(clamp.violationCin) && clamp.violationCin === violation.cin
}

const millis = (value) => {
  if (!value) return 0
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

// Unpaid, and recorded after the plate joined the account.
function isNewUnpaidOn(violation, { plate, since }) {
  return (
    !isPaymentSettled(violation.raw?.paymentStatus ?? violation.paymentStatus) &&
    samePlate(plate, violation.plateNumber) &&
    millis(violation.clampedAt) >= millis(since)
  )
}

// `impoundAccess` (server/impound-access.js) is only needed for the impound
// desk lookup and its passes.
export function createViolationAccess({ store, impoundAccess = null }) {
  async function findViolation(ref) {
    if (!ref) return null
    return (await store.getViolationById(ref)) ?? (await store.getViolationByCin(ref))
  }

  async function canView({ user, violation, token }) {
    if (isImpoundToken(token)) {
      const account = Boolean(user && !user.isGuest)
      if (impoundAccess?.allows(token, { uid: user?.uid, violationId: violation.id, account })) return true
    } else if (token && clampCarries(await store.getClampByToken(token), violation)) return true
    // Linked to this account by its payment (server/account-links.js).
    if (user && violation.raw?.violatorUid && violation.raw.violatorUid === user.uid) return true
    if (isOwnerAccount(user)) {
      const plates = await store.listActivePlates(user.uid)
      if (plates.some((p) => samePlate(p, violation.plateNumber))) return true
      const paidPlates = await store.listPaymentPlates(user.uid)
      if (paidPlates.some((p) => isNewUnpaidOn(violation, p))) return true
    }
    return Boolean(user) && (await store.hasAttemptFor(user.uid, violation.id))
  }

  // After scanning a QR sticker: the clamp's state and the violation on it.
  // Returns { found, clampNumber, status, violation }; `status` is the
  // clamp's own state, which the app combines with the violation's.
  async function scan({ token }) {
    const clamp = await store.getClampByToken(String(token ?? '').trim())
    if (!clamp) return { found: false, clampNumber: '', status: 'unknown', violation: null }

    let violation = null
    // "waiting": nothing recorded on this clamp (see deriveClampStatus).
    if (clamp.status !== 'waiting') {
      if (clamp.violationId) violation = await store.getViolationById(clamp.violationId)
      if (!violation && clamp.violationCin) violation = await store.getViolationByCin(clamp.violationCin)
    }
    return {
      found: true,
      clampNumber: clamp.clampNumber || violation?.clampId || '',
      status: clamp.status,
      violation: publicViolation(violation),
    }
  }

  // One violation, by its document id or violation number, if this person may
  // see it. Throws 404 otherwise.
  async function getViolation({ user, ref, token }) {
    const violation = await findViolation(String(ref ?? '').trim())
    if (!violation || !(await canView({ user, violation, token }))) throw NOT_FOUND()
    return violation
  }

  // Every violation on the signed-in owner's verified vehicles, the ones
  // linked to the account by a payment it made, and new unpaid ones on
  // plates it has from a payment (checklist P1).
  async function listMine({ user }) {
    if (!isOwnerAccount(user)) throw new HttpError(403, 'Log in with a verified account to see your violations.')
    const [plates, paidPlates] = await Promise.all([store.listActivePlates(user.uid), store.listPaymentPlates(user.uid)])
    const [onPlates, paid, onPaidPlates] = await Promise.all([
      plates.length ? store.listViolationsForPlates(plates) : [],
      store.listViolationsByViolator(user.uid),
      paidPlates.length ? store.listViolationsForPlates(paidPlates.map((p) => p.plate)) : [],
    ])
    const fresh = onPaidPlates.filter((v) => paidPlates.some((p) => isNewUnpaidOn(v, p)))
    const byId = new Map()
    for (const v of [...onPlates, ...paid, ...fresh]) byId.set(v.id, v)
    return [...byId.values()]
  }

  // Impound desk QR: the unpaid impound with this plate whose OVR No. ends
  // in these 4 characters (the newest, if more than one). Returns
  // { violation, token, expiresAt }; the token is the 30-minute pass.
  async function impoundLookup({ user, plate, ovrLast4 }) {
    const plateText = String(plate ?? '').trim()
    const last4 = String(ovrLast4 ?? '').trim().toUpperCase()
    if (!plateText || !/^[A-Z0-9]{4}$/.test(last4)) {
      throw new HttpError(400, 'Enter the plate number and the last 4 digits of the UOVR No.')
    }
    if (!impoundAccess || !user?.uid) throw new HttpError(503, 'The impound lookup is not available right now.')
    const matches = (await store.listImpoundedViolations()).filter(
      (v) =>
        !isPaymentSettled(v.raw?.paymentStatus ?? v.paymentStatus) &&
        samePlate(plateText, v.plateNumber) &&
        String(v.raw?.uovrNo ?? '').trim().toUpperCase().endsWith(last4),
    )
    if (matches.length === 0) throw new HttpError(404, IMPOUND_NOT_FOUND_MESSAGE)
    const recorded = (v) => millis(v.raw?.recordedAt ?? v.clampedAt)
    const violation = matches.reduce((newest, v) => (recorded(v) > recorded(newest) ? v : newest))
    return { violation, ...impoundAccess.issue({ uid: user.uid, violationId: violation.id }) }
  }

  return {
    scan,
    getViolation,
    listMine,
    impoundLookup,
    // Exposed for create-checkout: may this person pay this violation?
    canView,
    isSettled: (violation) => isPaymentSettled(violation.raw?.paymentStatus ?? violation.paymentStatus),
  }
}
