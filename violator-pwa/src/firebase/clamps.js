import { callApi } from '../api'
import { sampleClamps, sampleViolations } from '../data/sample'
import { ensureSignedIn } from './auth'
import { shouldUseSampleData } from './config'
import { normalizeClamp, normalizeClampStatusWord, normalizeSampleViolation } from './mapping'
import { rememberScanToken } from './scan-tokens'
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

// Offline demo (sample data): the clamp and its violation are looked up on
// the phone. Sample clamps have no scan tokens, so they match by code.
function readSampleClamp(token) {
  const found = sampleClamps.find((c) =>
    [c.id, c.qrId, c.clampNumber].some((v) => v?.toUpperCase() === token.toUpperCase()),
  )
  return found ? normalizeClamp(found.id, found) : null
}

function readSampleViolation(clamp, qrId) {
  // A sample code may be the violation's CIN itself.
  const cin = clamp?.violationCin ?? qrId
  const violationId = clamp?.violationId
  return newest(
    sampleViolations
      .filter((v) => (violationId && v.id === violationId) || (cin && v.cin === cin))
      .map(normalizeSampleViolation),
  )
}

// What the violator app needs after someone scans a clamp's QR code.
// Returns { found, qrId, clampNumber, status, violation }.
//
// With the real database the server does the lookup (api/violations.js):
// the QR sticker carries the clamp's secret scan token (see ScanRedirect),
// and only that token finds a clamp. The token is remembered for the
// violation it opened, so the violation page and Pay Now can prove the scan.
export async function resolveClamp(qrId) {
  if (!shouldUseSampleData) {
    // A guest straight off the QR code is signed in anonymously first.
    await ensureSignedIn()
    const result = await callApi('violations', { action: 'scan', token: qrId })
    if (!result.found) {
      return { found: false, qrId, clampNumber: '', status: CLAMP_STATUS.unknown, violation: null }
    }
    const violation = result.violation
    if (violation) rememberScanToken([violation.id, violation.cin], qrId)
    const clampStatus = normalizeClampStatusWord(result.status)
    return {
      found: true,
      qrId,
      clampNumber: result.clampNumber,
      status: violation ? violationStatus(violation, clampStatus) : clampStatus,
      violation,
    }
  }

  const clamp = readSampleClamp(qrId)

  if (!clamp) {
    // No sample clamp has this code; it may be a sample violation's CIN.
    const violation = readSampleViolation(null, qrId)
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

  const violation = clamp.status === CLAMP_STATUS.waiting ? null : readSampleViolation(clamp, qrId)

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
