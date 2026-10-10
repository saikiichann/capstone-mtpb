import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import auvPhoto from '../assets/vehicles/auv.jpg'
import hatchbackPhoto from '../assets/vehicles/hatchback.jpg'
import motorcyclePhoto from '../assets/vehicles/motorcycle.jpg'
import mpvPhoto from '../assets/vehicles/mpv.jpg'
import pickupPhoto from '../assets/vehicles/pickup.jpg'
import sedanPhoto from '../assets/vehicles/sedan.jpg'
import suvPhoto from '../assets/vehicles/suv.jpg'
import truckPhoto from '../assets/vehicles/truck.jpg'
import vanPhoto from '../assets/vehicles/van.jpg'
import { sampleVehicles } from '../data/sample'
import { toMillis } from '../utils/format'
import { db, shouldUseSampleData } from './config'
import { COLLECTIONS } from './schema'

// Vehicle fields (placeholders until the team's schema is final):
//   ownerUid, plateNumber, vehicleType, wheelCategory, color, make, model,
//   year, engineNumber, chassisNumber, orcrNumber,
//   vehicleType (picks the photo, see vehiclePhoto below), photoUrl,
//   verificationStatus ('pending' | 'active' | 'rejected'),
//   rejectionReason (set by MTPB), createdAt, updatedAt
//
// Owners no longer add vehicles themselves. A vehicle arrives on the account
// from the enforcement side when a violation is recorded against its plate,
// so this file only reads. Owners can't remove them either: they couldn't
// add one back.
//
// A vehicle may still arrive as "pending" and be set to "active" (or
// "rejected") by MTPB. Only active vehicles show their violations, so nobody
// can see another person's violations just by typing their plate number.

export const VERIFICATION = {
  pending: 'pending',
  active: 'active',
  rejected: 'rejected',
}

// Kept here too for the screens that already import them from this file.
export { normalizePlate, samePlate } from '../utils/plates'


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

// ---- Display helpers ----

// Uses the owner's uploaded photo when there is one; otherwise the stock
// image from the Figma file for that kind of vehicle.
// One photo per type in the enforcer app's dropdown: Sedan, SUV, Hatchback,
// Van, Pickup, Motorcycle, Truck, AUV, MPV. Only the type picks the photo;
// make and colour are shown as text, never matched. Words are matched
// loosely, so "Pickup Truck" or "Motorcycle (Manual)" still find theirs and
// anything unknown gets the sedan rather than nothing.
const TYPE_PHOTOS = {
  sedan: sedanPhoto,
  hatchback: hatchbackPhoto,
  suv: suvPhoto,
  van: vanPhoto,
  pickup: pickupPhoto,
  truck: truckPhoto,
  auv: auvPhoto,
  mpv: mpvPhoto,
  motorcycle: motorcyclePhoto,
}

export function vehicleKind(vehicle) {
  const type = String(vehicle?.vehicleType ?? '').toLowerCase()
  if (/motor|scooter/.test(type)) return 'motorcycle'
  if (!type && (vehicle?.category === 'motorcycle' || /^2\b/.test(vehicle?.wheelCategory ?? ''))) {
    return 'motorcycle'
  }
  if (/pick/.test(type)) return 'pickup'
  if (/truck/.test(type)) return 'truck'
  if (/\bauv\b/.test(type)) return 'auv'
  if (/\bmpv\b/.test(type)) return 'mpv'
  if (/van/.test(type)) return 'van'
  if (/suv|crossover/.test(type)) return 'suv'
  if (/hatch/.test(type)) return 'hatchback'
  return 'sedan'
}

// Owners can't upload photos. A `photoUrl` set by MTPB still wins; otherwise
// the vehicle gets the photo for its type. Type photos are white-background
// studio shots facing right; only the Home card mirrors them.
export function vehiclePhoto(vehicle) {
  if (vehicle?.photoUrl) return { src: vehicle.photoUrl, isStock: false, isTypePhoto: false }
  return { src: TYPE_PHOTOS[vehicleKind(vehicle)], isStock: true, isTypePhoto: true }
}

export function vehicleDescription(vehicle) {
  return [vehicle?.make, vehicle?.model, vehicle?.year].filter(Boolean).join(' ')
}

// "Sedan - 4 Wheels" on the My Vehicles cards.
export function vehicleTypeLine(vehicle) {
  const parts = [vehicle?.vehicleType, vehicle?.wheelCategory].filter(Boolean)
  return parts.length ? parts.join(' - ') : vehicleDescription(vehicle)
}
