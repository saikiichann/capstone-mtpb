import { useEffect, useState } from 'react'
import { isActiveVehicle, listVehicles } from '../firebase/vehicles'
import { listViolationsForPlates } from '../firebase/violations'
import { withLocalPaymentStatus } from '../payments'
import { toMillis } from '../utils/format'

// Loads every violation on the signed-in owner's verified (active)
// vehicles, newest first (with demo payments applied in demo mode).
// Returns { status: 'loading' | 'ready' | 'error', violations, unverifiedPlates }
// where unverifiedPlates lists vehicles MTPB hasn't approved yet, whose
// violations are left out on purpose.
const EMPTY = { violations: [], unverifiedPlates: [] }

export default function useMyViolations(uid) {
  const [result, setResult] = useState({ uid: null, status: 'loading', ...EMPTY })

  useEffect(() => {
    if (!uid) return undefined
    let cancelled = false

    async function load() {
      try {
        const vehicles = await listVehicles(uid)
        const active = vehicles.filter(isActiveVehicle)
        const unverifiedPlates = vehicles.filter((v) => !isActiveVehicle(v)).map((v) => v.plateNumber)
        const plates = [...new Set(active.map((v) => v.plateNumber).filter(Boolean))]
        const violations = (await listViolationsForPlates(plates))
          .map((v) => withLocalPaymentStatus(uid, v))
          .sort((a, b) => toMillis(b.clampedAt) - toMillis(a.clampedAt))
        if (!cancelled) setResult({ uid, status: 'ready', violations, unverifiedPlates })
      } catch (err) {
        console.error('Could not load violations', err)
        if (!cancelled) setResult({ uid, status: 'error', ...EMPTY })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [uid])

  if (result.uid !== uid) return { status: 'loading', ...EMPTY }
  return result
}
