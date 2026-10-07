// Translates the team's Firestore documents into the shape this app's pages
// expect.
//
// The admin app (Mira) and the enforcer app (Ian) name some fields
// differently from the violator app — `plateNo` for `plateNumber`,
// `officer` for `officerName`, `recordedAt` for `clampedAt`, and so on —
// and their statuses use different words ("Verified" rather than "paid").
//
// Rather than renaming things in twenty components, every document is passed
// through here on the way in. Each field lists the spellings it accepts, so
// ONE codebase works against both the shared project and the test project.
// If a name changes, add it to the list here and nothing else moves.

// The first name that actually has a value wins.
function pick(data, names, fallback = undefined) {
  for (const name of names) {
    const value = data?.[name]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return fallback
}

const FIELDS = {
  cin: ['cin', 'CIN', 'violationCin'],
  clampId: ['clampId', 'clampNumber', 'clampNo'],
  plateNumber: ['plateNumber', 'plateNo', 'plate'],
  officerName: ['officerName', 'officer', 'enforcer', 'enforcerName'],
  clampedAt: ['clampedAt', 'recordedAt', 'deployedAt', 'createdAt'],
  fineAmount: ['fineAmount', 'fine', 'amount'],
  violationType: ['violationType', 'violation', 'offense'],
  location: ['location', 'address', 'place'],
  paymentStatus: ['paymentStatus', 'payment_status'],
  referenceNumber: ['referenceNumber', 'paymentReference', 'reference'],
  paymentMethod: ['paymentMethod', 'method'],
  paidAt: ['paidAt', 'verifiedAt', 'settledAt'],
  status: ['status', 'violationStatus', 'releaseStatus'],
  // Clamped vs impounded as the admin app records it. Shown on Violation
  // Details so a violator knows whether they can pay online at all.
  // Not 'type' — that's the vehicle's body type in some documents.
  enforcementType: ['enforcementType', 'enforcement', 'actionType'],
  vehicleMake: ['vehicleMake', 'make'],
  vehicleType: ['vehicleType', 'type', 'clampType'],
  vehicleColor: ['vehicleColor', 'color'],
  evidencePhotos: ['evidencePhotos', 'photos', 'evidence', 'images'],
}

// Field names a violation's plate might be stored under. Firestore can't
// search two different fields in one query, so listViolationsForPlates runs
// one query per name in this list.
export const PLATE_FIELDS = FIELDS.plateNumber

// ---------------------------------------------------------------- statuses

const word = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

// Anything meaning "the money is in" counts as paid. Everything else —
// including a missing value — is unpaid, which is the safe way round: the
// worst case is showing Pay Now on something already settled, not letting a
// clamped vehicle look clear.
const PAID_WORDS = ['paid', 'verified', 'settled', 'complete', 'completed', 'success', 'successful']

// The admin app moves a paid violation to "Pending Verification" until
// finance staff approve it. For the violator the money is in, so it counts
// as paid (no Pay Now — paying again would charge them twice); the screens
// add "awaiting verification" from `awaitingVerification`. "Rejected" and
// "Unpaid" stay payable.
const VERIFYING_WORDS = ['pending_verification']
const SETTLED_WORDS = [...PAID_WORDS, ...VERIFYING_WORDS]
const REJECTED_WORDS = ['rejected', 'declined']

export function normalizePaymentStatus(value) {
  return SETTLED_WORDS.includes(word(value)) ? 'paid' : 'unpaid'
}

// Whether a violation can still be paid online.
export function isPaymentSettled(value) {
  return SETTLED_WORDS.includes(word(value))
}

// The violator app only distinguishes clamped from impounded, because that's
// what changes the instructions on screen. The admin app's richer workflow
// ("For Release", "Settled", "In queue") all means clamped as far as the
// violator is concerned.
const IMPOUNDED_WORDS = ['impounded', 'impound', 'towed', 'for_impound', 'impounding']

export function normalizeViolationStatus(value) {
  return IMPOUNDED_WORDS.includes(word(value)) ? 'impounded' : 'clamped'
}

// ------------------------------------------------------------- violations

export function normalizeViolation(id, data) {
  if (!data) return null

  const fine = Number(pick(data, FIELDS.fineAmount, 0))

  return {
    id,
    // The shared project uses the CIN as the document id, so fall back to it.
    cin: pick(data, FIELDS.cin, id),
    clampId: pick(data, FIELDS.clampId, ''),
    plateNumber: pick(data, FIELDS.plateNumber, ''),
    officerName: pick(data, FIELDS.officerName, ''),
    clampedAt: pick(data, FIELDS.clampedAt, null),
    fineAmount: Number.isFinite(fine) ? fine : 0,
    violationType: pick(data, FIELDS.violationType, ''),
    location: pick(data, FIELDS.location, ''),
    paymentStatus: normalizePaymentStatus(pick(data, FIELDS.paymentStatus)),
    awaitingVerification: VERIFYING_WORDS.includes(word(pick(data, FIELDS.paymentStatus))),
    // Why finance staff turned a payment down, shown beside Pay Now.
    rejectionReason: REJECTED_WORDS.includes(word(pick(data, FIELDS.paymentStatus)))
      ? pick(data, ['rejectionReason'], '')
      : '',
    referenceNumber: pick(data, FIELDS.referenceNumber, ''),
    paymentMethod: pick(data, FIELDS.paymentMethod, ''),
    paidAt: pick(data, FIELDS.paidAt, null),
    status: normalizeViolationStatus(pick(data, FIELDS.enforcementType) ?? pick(data, FIELDS.status)),
    // Kept as written by the admin app ("Clamping", "Impounding"), since it's
    // shown to the violator as a label rather than used for logic.
    enforcementType: pick(data, FIELDS.enforcementType, ''),
    vehicleMake: pick(data, FIELDS.vehicleMake, ''),
    vehicleType: pick(data, FIELDS.vehicleType, ''),
    vehicleColor: pick(data, FIELDS.vehicleColor, ''),
    evidencePhotos: pick(data, FIELDS.evidencePhotos, []),
    // Kept so the admin app's extra fields (releaseStatus, verifiedBy, the
    // queue number) can be shown later without touching this file again.
    raw: data,
  }
}

export function normalizeViolationDoc(snapshot) {
  return snapshot.exists?.() === false ? null : normalizeViolation(snapshot.id, snapshot.data())
}

// Sample data is already in the app's own shape, but running it through the
// same function keeps one code path and catches mistakes in the samples.
export function normalizeSampleViolation(violation) {
  return violation ? { ...normalizeViolation(violation.id, violation), id: violation.id } : null
}

// ------------------------------------------------------------------ clamps

const CLAMP_FIELD_NAMES = {
  qrId: ['qrId', 'qrCode', 'qr', 'code'],
  clampNumber: ['clampNumber', 'clampId', 'label', 'clampNo'],
  status: ['status', 'clampStatus'],
  violationId: ['currentViolationId', 'violationId', 'activeViolationId'],
  violationCin: ['currentCin', 'cin', 'violationCin'],
}

// The clamp's own lifecycle, as the violator app understands it:
//   waiting            nothing to pay on this clamp
//   for_payment        a violation is live on it
//   paid               settled, waiting for an enforcer
//   ready_for_release  an enforcer is on the way
//   released           clamp removed
const CLAMP_WORDS = {
  waiting: ['waiting', 'available', 'open', 'idle', 'unassigned', 'in_stock'],
  for_payment: ['for_payment', 'unpaid', 'active', 'clamped', 'deployed', 'pending_payment', 'in_use'],
  paid: ['paid', 'verified', 'settled'],
  ready_for_release: ['ready_for_release', 'for_release', 'release_ready', 'ready', 'in_queue'],
  released: ['released', 'removed', 'closed', 'done', 'retrieved'],
}

export function normalizeClampStatusWord(value) {
  const key = word(value)
  if (!key) return 'waiting'
  for (const [status, words] of Object.entries(CLAMP_WORDS)) {
    if (words.includes(key)) return status
  }
  return 'unknown'
}

// The admin app doesn't trust a clamp's stored `status` (it can lag behind,
// e.g. "available" on a clamp that has a violation on it). Its QR Management
// works the state out from the clamp's other fields, in this order — see
// deriveState in admin-web's QRManagement.tsx — and so does this app.
const CLAMP_LIFECYCLE_FIELDS = ['releasedAt', 'readyAt', 'paidAt', 'deployedAt', 'cin', 'currentViolationId']

function deriveClampStatus(data) {
  // Older or sample clamps without these fields keep their stored status.
  if (!CLAMP_LIFECYCLE_FIELDS.some((field) => field in data)) {
    return normalizeClampStatusWord(pick(data, CLAMP_FIELD_NAMES.status))
  }
  if (data.releasedAt) return 'released'
  if (data.readyAt) return 'ready_for_release'
  if (data.paidAt) return 'paid'
  if (data.deployedAt || data.cin || data.currentViolationId) return 'for_payment'
  return 'waiting'
}

export function normalizeClamp(id, data) {
  if (!data) return null
  return {
    id,
    qrId: pick(data, CLAMP_FIELD_NAMES.qrId, id),
    clampNumber: pick(data, CLAMP_FIELD_NAMES.clampNumber, ''),
    status: deriveClampStatus(data),
    violationId: pick(data, CLAMP_FIELD_NAMES.violationId, null),
    violationCin: pick(data, CLAMP_FIELD_NAMES.violationCin, null),
    raw: data,
  }
}

// What a QR sticker carries: the admin app's secret scan token, the only way
// a scan finds a clamp (the clamp number is never accepted).
export const CLAMP_TOKEN_FIELD = 'scanToken'

// ---- Payments ----
//
// Payment documents are written by our own backend, but they are read back
// from a database the admin app also writes to, and the two don't agree on
// spelling. Reading them raw is what made a settled payment look unpaid:
// the receipt refused to open, History totalled zero, and Recent Activity
// came up empty. Everything else in this file exists for the same reason —
// payments were simply the collection that got missed.
//
// The admin app's own payments use `amount` for the fine and `totalAmount`
// for fine + fee, and `verificationStatus` once staff have acted on them.
const PAYMENT_FIELDS = {
  status: ['verificationStatus', 'status', 'paymentStatus', 'payment_status', 'state'],
  referenceNumber: ['referenceNumber', 'paymentReference', 'reference', 'refNo'],
  violationCin: ['violationCin', 'cin', 'CIN'],
  violationId: ['violationId', 'violation_id'],
  plateNumber: ['plateNumber', 'plateNo', 'plate'],
  method: ['method', 'paymentMethod', 'channel'],
  fineAmount: ['fineAmount', 'fine'],
  convenienceFee: ['convenienceFee', 'serviceFee', 'fee'],
  amount: ['totalAmount', 'totalPaid', 'total', 'amountPaid', 'amount'],
  paidAt: ['paidAt', 'verifiedAt', 'settledAt', 'completedAt'],
  createdAt: ['createdAt', 'startedAt', 'recordedAt'],
  violationType: ['violationType', 'violation', 'offense'],
  location: ['location', 'address', 'place'],
  officerName: ['officerName', 'officer', 'enforcer'],
  checkoutSessionId: ['checkoutSessionId', 'sessionId'],
}

// Only money that's actually in reaches `payments` (unpaid checkouts stay in
// the backend's checkoutAttempts), so a "pending" payment there is waiting
// for finance staff, not for the violator:
//   paid       verified by MTPB staff
//   verifying  received, waiting for staff to verify it
//   rejected   staff turned it down; the violation is payable again
//   unpaid     anything else
const PAYMENT_PAID_WORDS = [...PAID_WORDS, 'succeeded', 'approved']
const PAYMENT_VERIFYING_WORDS = ['pending', 'pending_verification']
const PAYMENT_REJECTED_WORDS = [...REJECTED_WORDS, 'failed']

export function normalizePaymentState(value) {
  const key = word(value)
  if (PAYMENT_PAID_WORDS.includes(key)) return 'paid'
  if (PAYMENT_VERIFYING_WORDS.includes(key)) return 'verifying'
  if (PAYMENT_REJECTED_WORDS.includes(key)) return 'rejected'
  return 'unpaid'
}

export function normalizePayment(id, data) {
  if (!data) return null
  const state = normalizePaymentState(pick(data, PAYMENT_FIELDS.status))
  const total = Number(pick(data, PAYMENT_FIELDS.amount, 0)) || 0
  const fee = Number(pick(data, PAYMENT_FIELDS.convenienceFee, 0)) || 0
  // The admin app's `amount` is the fine alone when `totalAmount` is there.
  const fine = pick(data, PAYMENT_FIELDS.fineAmount) ?? (data.totalAmount != null ? data.amount : total - fee)
  return {
    // The document id is the reference number in our own writes; the field
    // wins when something else created the document.
    referenceNumber: pick(data, PAYMENT_FIELDS.referenceNumber, id),
    status: state,
    // Has a receipt: the money is in, verified or not.
    isPaid: state === 'paid' || state === 'verifying',
    awaitingVerification: state === 'verifying',
    violationCin: pick(data, PAYMENT_FIELDS.violationCin, ''),
    violationId: pick(data, PAYMENT_FIELDS.violationId, ''),
    plateNumber: pick(data, PAYMENT_FIELDS.plateNumber, ''),
    method: pick(data, PAYMENT_FIELDS.method, ''),
    fineAmount: Number(fine) || 0,
    convenienceFee: fee,
    amount: total,
    paidAt: pick(data, PAYMENT_FIELDS.paidAt, null),
    createdAt: pick(data, PAYMENT_FIELDS.createdAt, null),
    violationType: pick(data, PAYMENT_FIELDS.violationType, ''),
    location: pick(data, PAYMENT_FIELDS.location, ''),
    officerName: pick(data, PAYMENT_FIELDS.officerName, ''),
    checkoutSessionId: pick(data, PAYMENT_FIELDS.checkoutSessionId, ''),
    // PayMongo's own flags, read straight through for the sandbox notice.
    sandbox: data.sandbox,
    livemode: data.livemode,
    raw: data,
  }
}
