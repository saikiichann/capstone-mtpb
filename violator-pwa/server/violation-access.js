import { isPaymentSettled } from '../src/firebase/mapping.js'
import { samePlate } from '../src/utils/plates.js'
import { HttpError } from './payments-service.js'

// Who may see a violation (checklist S2). The app used to read clamps and
// violations straight from Firestore, which meant any guest sign-in could read
// all of them (plates, places, times, officers). Now only this server reads
// them, and a violation is shown to:
// - someone who scanned the QR sticker of the clamp it is on (they send the
//   sticker's scan token along),
// - its owner: a signed-in, verified account with a verified ("active")
//   vehicle of that plate,
// - whoever started a payment for it (so receipts and the paid violation
//   stay visible after the clamp is released).
// Anyone else gets "not found", whether or not it exists, so violation
// numbers can't be guessed.
//
// `store` is server/firestore-store.js (tests pass an in-memory one).

const NOT_FOUND = () => new HttpError(404, 'Violation not found.')

// Firestore Timestamps don't survive JSON; the app reads ISO strings.
function iso(value) {
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
    officerName: v.officerName,
    clampedAt: iso(v.clampedAt),
    fineAmount: v.fineAmount,
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

// Owners need a verified email; guests (anonymous) never own vehicles.
const isOwnerAccount = (user) => Boolean(user && !user.isGuest && user.email_verified)

// The violation the clamp is carrying now: by its id when the clamp has one,
// otherwise by the clamp's violation number.
function clampCarries(clamp, violation) {
  if (!clamp || !violation) return false
  if (clamp.violationId) return clamp.violationId === violation.id
  return Boolean(clamp.violationCin) && clamp.violationCin === violation.cin
}

export function createViolationAccess({ store }) {
  async function findViolation(ref) {
    if (!ref) return null
    return (await store.getViolationById(ref)) ?? (await store.getViolationByCin(ref))
  }

  async function canView({ user, violation, token }) {
    if (token && clampCarries(await store.getClampByToken(token), violation)) return true
    if (isOwnerAccount(user)) {
      const plates = await store.listActivePlates(user.uid)
      if (plates.some((p) => samePlate(p, violation.plateNumber))) return true
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

  // Every violation on the signed-in owner's verified vehicles.
  async function listMine({ user }) {
    if (!isOwnerAccount(user)) throw new HttpError(403, 'Log in with a verified account to see your violations.')
    const plates = await store.listActivePlates(user.uid)
    if (plates.length === 0) return []
    return store.listViolationsForPlates(plates)
  }

  return {
    scan,
    getViolation,
    listMine,
    // Exposed for create-checkout: may this person pay this violation?
    canView,
    isSettled: (violation) => isPaymentSettled(violation.raw?.paymentStatus ?? violation.paymentStatus),
  }
}
