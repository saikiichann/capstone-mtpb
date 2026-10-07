import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { sampleClamps, sampleViolations } from '../data/sample'
import { ensureSignedIn } from './auth'
import { db, shouldUseSampleData } from './config'
import {
  CLAMP_TOKEN_FIELD,
  normalizeClamp,
  normalizeClampStatusWord,
  normalizeSampleViolation,
} from './mapping'
import { COLLECTIONS } from './schema'
import { newest } from './violations'

// The QR code printed on a clamp belongs to the CLAMP, not to a violation.
// The admin app registers each clamp — A-11 is the number stamped on it so an
// enforcer knows which one they're holding — and the sticker's code is what
// the violator scans.
//
// That code stays with the clamp on purpose: every violation ever recorded on
// it shares the same CIN, which is how the admin app groups a clamp's history
// for the annual report. Only one violation is live at a time, so "which one
// do I pay?" always has one answer — the newest unpaid one.
//
// Its status walks through the impounding process:
//   waiting            no violation on this clamp (the QR does nothing yet)
//   for_payment        the enforcer recorded a violation — the violator pays
//   paid               payment received, waiting for an enforcer
//   ready_for_release  an enforcer is on the way / clamp being removed
//   released           clamp removed; the record goes back to waiting
//
// Field names and status spellings are handled in mapping.js, so the admin
// app's words ("available", "deployed") arrive here already translated.
export const CLAMP_STATUS = {
  waiting: 'waiting',
  forPayment: 'for_payment',
  paid: 'paid',
  readyForRelease: 'ready_for_release',
  released: 'released',
  unknown: 'unknown',
}

export const normalizeClampStatus = normalizeClampStatusWord

// The QR sticker carries the clamp's secret scan token (see ScanRedirect).
// Only that token finds a clamp; its document id or printed number don't.
// Sample data (offline demo) has no tokens, so it still matches by code.
async function readClamp(token) {
  if (shouldUseSampleData) {
    const found = sampleClamps.find((c) =>
      [c.id, c.qrId, c.clampNumber].some((v) => v?.toUpperCase() === token.toUpperCase()),
    )
    return found ? normalizeClamp(found.id, found) : null
  }

  const found = await getDocs(
    query(collection(db, COLLECTIONS.clamps), where(CLAMP_TOKEN_FIELD, '==', token), limit(1)),
  )
  return found.empty ? null : normalizeClamp(found.docs[0].id, found.docs[0].data())
}

async function readViolationForClamp(clamp, qrId) {
  // Offline demo only: a sample code may be the violation's CIN itself.
  const cin = clamp?.violationCin ?? (shouldUseSampleData ? qrId : null)
  const violationId = clamp?.violationId

  if (shouldUseSampleData) {
    return newest(
      sampleViolations
        .filter((v) => (violationId && v.id === violationId) || (cin && v.cin === cin))
        .map(normalizeSampleViolation),
    )
  }

  if (violationId) {
    const byId = await getDoc(doc(db, COLLECTIONS.violations, violationId))
    if (byId.exists()) return normalizeClampViolation(byId)
  }
  if (cin) {
    // In the shared project the CIN is the document id, so try that first.
    const byDocId = await getDoc(doc(db, COLLECTIONS.violations, cin))
    if (byDocId.exists()) return normalizeClampViolation(byDocId)

    const byCin = await getDocs(query(collection(db, COLLECTIONS.violations), where('cin', '==', cin)))
    if (!byCin.empty) {
      // A clamp's whole history shares this code, so this can return several
      // years of violations. newest() takes the one still to be paid, and the
      // most recent if more than one is unpaid.
      return newest(byCin.docs.map((d) => normalizeClampViolation(d)))
    }
  }
  return null
}

function normalizeClampViolation(snapshot) {
  return normalizeSampleViolation({ id: snapshot.id, ...snapshot.data() })
}

// What the violator app needs after someone scans a clamp's QR code.
// Returns { found, qrId, clampNumber, status, violation }.
export async function resolveClamp(qrId) {
  // The shared project only lets signed-in users read clamps and violations,
  // so a guest straight off the QR code is signed in anonymously first.
  if (!shouldUseSampleData) await ensureSignedIn()

  const clamp = await readClamp(qrId)

  if (!clamp) {
    // No clamp has this token (mistyped, or re-issued by IT so the old
    // sticker no longer works). In the offline demo a code can also be a
    // sample violation's CIN; with Firestore that lookup is skipped.
    const violation = shouldUseSampleData ? await readViolationForClamp(null, qrId) : null
    if (!violation) {
      return { found: false, qrId, clampNumber: '', status: CLAMP_STATUS.unknown, violation: null }
    }
    return {
      found: true,
      qrId,
      clampNumber: violation.clampId ?? '',
      status: violation.paymentStatus === 'paid' ? CLAMP_STATUS.paid : CLAMP_STATUS.forPayment,
      violation,
    }
  }

  const violation = clamp.status === CLAMP_STATUS.waiting ? null : await readViolationForClamp(clamp, qrId)

  // A clamp left on "available" while a violation is live on it would hide
  // the violation, so trust the violation when the two disagree.
  const status =
    !violation && clamp.status !== CLAMP_STATUS.waiting
      ? clamp.status
      : violation
        ? violationStatus(violation, clamp.status)
        : clamp.status

  return {
    found: true,
    qrId,
    clampNumber: clamp.clampNumber || violation?.clampId || '',
    status,
    violation,
  }
}

function violationStatus(violation, clampStatus) {
  if (violation.paymentStatus === 'paid') {
    return clampStatus === CLAMP_STATUS.readyForRelease || clampStatus === CLAMP_STATUS.released
      ? clampStatus
      : CLAMP_STATUS.paid
  }
  return CLAMP_STATUS.forPayment
}
