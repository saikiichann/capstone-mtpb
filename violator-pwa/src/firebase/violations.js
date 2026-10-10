import { callApi } from '../api'
import { sampleViolations } from '../data/sample'
import { toMillis } from '../utils/format'
import { samePlate } from '../utils/plates'
import { ensureSignedIn } from './auth'
import { shouldUseSampleData } from './config'
import { normalizeSampleViolation } from './mapping'
import { scanTokenFor } from './scan-tokens'

// Violations come from the app's own server (api/violations.js), which only
// returns the ones this person may see: the clamp they scanned, their own
// verified vehicles', or one they paid (checklist S2). The database itself
// is for MTPB staff. The offline demo still reads sample data on the phone.

export function newest(list) {
  const items = list.filter(Boolean)
  if (items.length <= 1) return items[0] ?? null
  // Prefer one that still needs paying; otherwise the most recent.
  const unpaid = items.filter((v) => v.paymentStatus !== 'paid')
  const pool = unpaid.length ? unpaid : items
  return [...pool].sort((a, b) => toMillis(b.clampedAt) - toMillis(a.clampedAt))[0]
}

// One violation by its document id or violation number (links inside the app
// use the id). null when it doesn't exist or this person may not see it.
export async function getViolation(ref) {
  if (!ref) return null
  if (shouldUseSampleData) {
    return (
      normalizeSampleViolation(sampleViolations.find((v) => v.id === ref)) ??
      newest(sampleViolations.filter((v) => v.cin === ref).map(normalizeSampleViolation))
    )
  }

  await ensureSignedIn()
  try {
    const { violation } = await callApi('violations', { action: 'get', ref, token: scanTokenFor(ref) })
    return violation
  } catch (err) {
    if (err?.status === 404) return null
    throw err
  }
}

// Violations recorded against the signed-in owner's verified vehicles. The
// server finds the plates itself; `plateNumbers` is only used for sample data.
export async function listMyViolations(plateNumbers) {
  if (shouldUseSampleData) {
    return sampleViolations
      .filter((v) => plateNumbers.some((p) => samePlate(p, v.plateNumber)))
      .map(normalizeSampleViolation)
  }
  if (plateNumbers.length === 0) return []
  const { violations } = await callApi('violations', { action: 'mine' })
  return violations
}
