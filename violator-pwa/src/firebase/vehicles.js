import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import carPhoto from '../assets/vehicle-car-sample.webp'
import motorcyclePhoto from '../assets/vehicle-motorcycle-sample.webp'
import { sampleVehicles } from '../data/sample'
import { toMillis } from '../utils/format'
import { db, shouldUseSampleData } from './config'
import { COLLECTIONS } from './schema'

// Vehicle fields (placeholders until the team's schema is final):
//   ownerUid, plateNumber, vehicleType, wheelCategory, color, make, model,
//   year, engineNumber, chassisNumber, orcrNumber,
//   category ('car' | 'motorcycle', picks the stock photo), photoUrl,
//   verificationStatus ('pending' | 'active' | 'rejected'),
//   rejectionReason (set by MTPB), createdAt, updatedAt
//
// Owners no longer add vehicles themselves. A vehicle arrives on the account
// from the enforcement side when a violation is recorded against its plate,
// so this file only reads, edits and removes.
//
// A vehicle may still arrive as "pending" and be set to "active" (or
// "rejected") by MTPB. Only active vehicles show their violations, so nobody
// can see another person's violations just by typing their plate number.

export const VERIFICATION = {
  pending: 'pending',
  active: 'active',
  rejected: 'rejected',
}

export const WHEEL_CATEGORIES = ['2 Wheels', '3 Wheels', '4 Wheels', '6 Wheels or more']

// Picking a type fills in the usual wheel category (still editable).
export const VEHICLE_TYPES = [
  { label: 'Sedan', wheels: '4 Wheels' },
  { label: 'Hatchback', wheels: '4 Wheels' },
  { label: 'SUV', wheels: '4 Wheels' },
  { label: 'Pickup', wheels: '4 Wheels' },
  { label: 'Van', wheels: '4 Wheels' },
  { label: 'Motorcycle', wheels: '2 Wheels', category: 'motorcycle' },
  { label: 'Tricycle', wheels: '3 Wheels' },
  { label: 'Truck', wheels: '6 Wheels or more' },
  { label: 'Other', wheels: '' },
]

export function defaultWheelsFor(vehicleType) {
  return VEHICLE_TYPES.find((t) => t.label === vehicleType)?.wheels ?? ''
}

// "abc  1234 " → "ABC 1234". Violations are matched on the exact plate
// text, so the enforcer app should save plates the same way.
export function normalizePlate(value = '') {
  return value.toUpperCase().trim().replace(/\s+/g, ' ')
}

// Same plate even if spaces or dashes differ ("ABC-1234" = "ABC 1234").
export function samePlate(a, b) {
  const key = (v) => normalizePlate(v).replace(/[\s-]/g, '')
  return key(a) === key(b)
}


// ---- Demo mode: changes kept on this device only ----
// { [uid]: { added: [vehicle], edits: { [id]: changes }, removed: [id] } }

const DEMO_KEY = 'mtpb-demo-vehicles'

function readDemo(uid) {
  try {
    const saved = (JSON.parse(localStorage.getItem(DEMO_KEY)) || {})[uid]
    // Older demo data was just a list of added vehicles.
    if (Array.isArray(saved)) return { added: saved, edits: {}, removed: [] }
    return { added: [], edits: {}, removed: [], ...saved }
  } catch {
    return { added: [], edits: {}, removed: [] }
  }
}

function changeDemo(uid, change) {
  try {
    const all = JSON.parse(localStorage.getItem(DEMO_KEY)) || {}
    all[uid] = change(readDemo(uid))
    localStorage.setItem(DEMO_KEY, JSON.stringify(all))
  } catch {
    // Storage unavailable: the change won't be remembered after a refresh.
  }
}

function demoVehicles(uid) {
  const { added, edits, removed } = readDemo(uid)
  return [...sampleVehicles, ...added]
    .filter((v) => !removed.includes(v.id))
    .map((v) => ({ ...v, ...edits[v.id] }))
}

// ---- Reading ----

// Returns the owner's vehicles, oldest first (the first one registered is
// the one shown on the dashboard).
export async function listVehicles(ownerUid) {
  if (shouldUseSampleData) return demoVehicles(ownerUid)

  const q = query(collection(db, COLLECTIONS.vehicles), where('ownerUid', '==', ownerUid))
  const snapshot = await getDocs(q)
  // Sorted here instead of with orderBy() so Firestore doesn't need a
  // composite index for this query.
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
}

// One of the owner's vehicles, or null if it doesn't exist or isn't theirs.
export async function getVehicle(ownerUid, vehicleId) {
  if (shouldUseSampleData) return demoVehicles(ownerUid).find((v) => v.id === vehicleId) ?? null

  try {
    const snapshot = await getDoc(doc(db, COLLECTIONS.vehicles, vehicleId))
    if (!snapshot.exists() || snapshot.data().ownerUid !== ownerUid) return null
    return { id: snapshot.id, ...snapshot.data() }
  } catch (err) {
    // The rules refuse reads of other people's (or missing) vehicles.
    if (err?.code === 'permission-denied') return null
    throw err
  }
}

export function verificationOf(vehicle) {
  // Vehicles added by hand before verification existed count as pending.
  return vehicle?.verificationStatus ?? VERIFICATION.pending
}

export function isActiveVehicle(vehicle) {
  return verificationOf(vehicle) === VERIFICATION.active
}

// ---- Removing ----

// Violations and payments stay in the records; they just stop showing in
// the app once the vehicle is removed.
export async function removeVehicle(ownerUid, vehicle) {
  if (shouldUseSampleData) {
    changeDemo(ownerUid, (demo) => ({
      ...demo,
      added: demo.added.filter((v) => v.id !== vehicle.id),
      removed: [...demo.removed, vehicle.id],
    }))
    return
  }
  await deleteDoc(doc(db, COLLECTIONS.vehicles, vehicle.id))
}

// ---- Display helpers ----

// Uses the owner's uploaded photo when there is one; otherwise the stock
// image from the Figma file for that kind of vehicle.
export function vehiclePhoto(vehicle) {
  if (vehicle?.photoUrl) return { src: vehicle.photoUrl, isStock: false }
  return {
    src: vehicle?.category === 'motorcycle' ? motorcyclePhoto : carPhoto,
    isStock: true,
  }
}

export function vehicleDescription(vehicle) {
  return [vehicle?.make, vehicle?.model, vehicle?.year].filter(Boolean).join(' ')
}

// "Sedan - 4 Wheels" on the My Vehicles cards.
export function vehicleTypeLine(vehicle) {
  const parts = [vehicle?.vehicleType, vehicle?.wheelCategory].filter(Boolean)
  return parts.length ? parts.join(' - ') : vehicleDescription(vehicle)
}
