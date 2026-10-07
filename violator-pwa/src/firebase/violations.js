import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { sampleViolations } from '../data/sample'
import { ensureSignedIn } from './auth'
import { db, shouldUseSampleData } from './config'
import { normalizeSampleViolation, normalizeViolation, PLATE_FIELDS } from './mapping'
import { COLLECTIONS } from './schema'
import { toMillis } from '../utils/format'
import { normalizePlate, samePlate } from './vehicles'

// Every document read here goes through normalizeViolation (see mapping.js),
// which is what lets the app run against both the team's shared project and
// the test project even though they name fields differently.

// A clamp's QR id stays with the clamp, so the same code appears on every
// violation that clamp ever carries — deliberately, since the admin app
// groups a clamp's history on it for the annual report. Only one is live at
// a time, so looking one up by code means "the newest unpaid one", and
// anything that has to be exact uses the violation's own document id.
export async function getViolationByCin(cin) {
  if (shouldUseSampleData) {
    return newest(sampleViolations.filter((v) => v.cin === cin).map(normalizeSampleViolation))
  }

  await ensureSignedIn()
  const q = query(collection(db, COLLECTIONS.violations), where('cin', '==', cin))
  const snapshot = await getDocs(q)
  if (snapshot.empty) return null
  return newest(snapshot.docs.map((d) => normalizeViolation(d.id, d.data())))
}

export function newest(list) {
  const items = list.filter(Boolean)
  if (items.length <= 1) return items[0] ?? null
  // Prefer one that still needs paying; otherwise the most recent.
  const unpaid = items.filter((v) => v.paymentStatus !== 'paid')
  const pool = unpaid.length ? unpaid : items
  return [...pool].sort((a, b) => toMillis(b.clampedAt) - toMillis(a.clampedAt))[0]
}

// Accepts a violation document id or a QR id, so links inside the app stay
// exact while a scanned code still works. In the shared project the document
// id IS the CIN, so the first lookup usually succeeds.
export async function getViolation(ref) {
  if (!ref) return null
  const byId = await getViolationById(ref)
  return byId ?? getViolationByCin(ref)
}

export async function getViolationById(id) {
  if (shouldUseSampleData) {
    return normalizeSampleViolation(sampleViolations.find((v) => v.id === id))
  }

  await ensureSignedIn()
  const snapshot = await getDoc(doc(db, COLLECTIONS.violations, id))
  return snapshot.exists() ? normalizeViolation(snapshot.id, snapshot.data()) : null
}

// The ways a plate might have been typed by the enforcer app:
// "ABC 1234", "ABC1234", "ABC-1234". Firestore only finds exact matches.
function plateSpellings(plate) {
  const clean = normalizePlate(plate)
  const compact = clean.replace(/[\s-]/g, '')
  const parts = clean.split(/[\s-]+/)
  return [...new Set([plate, clean, compact, parts.join(' '), parts.join('-')])].filter(Boolean)
}

// Violations recorded against any of the owner's plate numbers.
//
// Firestore can't search two different fields in one query, and the plate
// lives under `plateNumber` in one project and `plateNo` in the other — so
// this runs a query per field name and merges by document id.
export async function listViolationsForPlates(plateNumbers) {
  if (shouldUseSampleData) {
    return sampleViolations
      .filter((v) => plateNumbers.some((p) => samePlate(p, v.plateNumber)))
      .map(normalizeSampleViolation)
  }
  if (plateNumbers.length === 0) return []

  const spellings = [...new Set(plateNumbers.flatMap(plateSpellings))]
  // Firestore allows at most 30 values in one "in" query.
  const chunks = []
  for (let i = 0; i < spellings.length; i += 30) chunks.push(spellings.slice(i, i + 30))

  const lookups = PLATE_FIELDS.flatMap((field) =>
    chunks.map(async (plates) => {
      try {
        return await getDocs(query(collection(db, COLLECTIONS.violations), where(field, 'in', plates)))
      } catch (error) {
        // A field the project doesn't use can fail on rules or a missing
        // index. That's expected here, so don't let it sink the others.
        console.debug(`No violations matched on "${field}"`, error)
        return null
      }
    }),
  )

  const results = await Promise.all(lookups)
  const byId = new Map()
  for (const snapshot of results) {
    if (!snapshot) continue
    for (const d of snapshot.docs) byId.set(d.id, normalizeViolation(d.id, d.data()))
  }
  return [...byId.values()]
}
