// Firestore names in one place, so switching between projects only means
// checking this file. Field names are handled separately, in mapping.js.
//
// Firestore names are case-sensitive: `Violators` and `violators` are two
// different collections.

// The profile collection differs between projects — the test project uses
// `Violators`, the shared project uses lowercase `violators` to sit beside
// the admin app's own `users`. Set VITE_VIOLATORS_COLLECTION in .env.local
// (and in Vercel) rather than editing this file.
//
// This file is imported by BOTH the browser app and the Vercel functions.
// Vite replaces `import.meta.env` at build time; plain Node has no such
// object, and reading a property off it there throws and takes the whole
// serverless function down. So read whichever exists.
function envValue(name) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.[name]) return import.meta.env[name]
  } catch {
    // Not a Vite build — fall through to process.env.
  }
  if (typeof process !== 'undefined' && process.env?.[name]) return process.env[name]
  return undefined
}

const violatorsCollection = envValue('VITE_VIOLATORS_COLLECTION') || 'Violators'

export const COLLECTIONS = {
  // One document per vehicle owner, with the document ID = their Auth uid.
  violators: violatorsCollection,
  violations: 'violations',
  // Registered vehicles. Each document has ownerUid = the violator's uid.
  vehicles: 'vehicles',
  // The admin app's payments: cash recorded by finance staff and, from our
  // backend, online payments PayMongo has confirmed. Random document IDs,
  // the admin app's field names. Finance staff verify each one there.
  payments: 'payments',
  // Our own record of every Pay Now press, paid or not. Backend only, so
  // abandoned checkouts never reach the admin app's verification queue.
  checkoutAttempts: 'checkoutAttempts',
  // The admin app's counters. Reference numbers come from PAYMENT_COUNTER_ID,
  // shared with its cash payments so the two never hand out the same number.
  counters: 'counters',
  // Registered clamps from the admin app. The QR sticker on each clamp
  // points at the violator app with this id (see src/firebase/clamps.js).
  clamps: 'clamps',
}

// counters/paymentReference: { lastValue, prefix, updatedAt }, as the admin
// app's cash payments write it.
export const PAYMENT_COUNTER_ID = 'paymentReference'

// role_id stored on every violator document.
// TODO: replace with the role_id value the team's RBAC uses for violators.
export const VIOLATOR_ROLE_ID = 'violator'

// Violators documents (one per owner, document id = their Auth uid):
//   uid, full_name, email, mobile_number, role_id, orcr_url, created_at
//   address  — added by Profile → Edit Profile
//   wallets: [{ id, provider: 'gcash', mobileNumber, isDefault }]
//            — saved numbers that fill in the payment form, no stored
//              credentials of any kind
//   updated_at — set whenever the owner saves profile changes

// Clamps (registered in the admin app, one QR code each):
//   status: waiting | for_payment | paid | ready_for_release | released
//   currentCin / currentViolationId: the violation attached right now
//   label: the printed clamp id, e.g. "R-24", when it isn't the document id
//
// Violations, as far as the violator app is concerned:
//   cin, clampId, clampedAt, status ('clamped' | 'impounded'),
//   paymentStatus ('Unpaid' | 'Pending Verification' | 'Verified' | 'Rejected'),
//   referenceNumber / paymentReference (set when a payment is recorded),
//   plateNumber, vehicleMake, vehicleType, vehicleColor, violationType,
//   location, fineAmount, officerName,
//   evidencePhotos: [url] or [{ url, caption, takenAt }] from the enforcer app
