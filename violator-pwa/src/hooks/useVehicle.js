import { useCallback, useEffect, useState } from 'react'
import { getVehicle } from '../firebase/vehicles'

// Loads one of the owner's vehicles.
// Returns { status: 'loading' | 'ready' | 'not-found' | 'error', vehicle, setVehicle }.
export default function useVehicle(ownerUid, vehicleId) {
  const key = `${ownerUid ?? ''}|${vehicleId}`
  const [result, setResult] = useState({ key: null, status: 'loading', vehicle: null })

  useEffect(() => {
    if (!ownerUid) return undefined
    let cancelled = false
    getVehicle(ownerUid, vehicleId)
      .then((vehicle) => {
        if (!cancelled) setResult({ key, status: vehicle ? 'ready' : 'not-found', vehicle })
      })
      .catch((err) => {
        console.error('Could not load vehicle', err)
        if (!cancelled) setResult({ key, status: 'error', vehicle: null })
      })
    return () => {
      cancelled = true
    }
  }, [ownerUid, vehicleId, key])

  // After saving, show the new values without loading again.
  const setVehicle = useCallback((vehicle) => setResult({ key, status: 'ready', vehicle }), [key])

  if (result.key !== key) return { status: 'loading', vehicle: null, setVehicle }
  return { ...result, setVehicle }
}
