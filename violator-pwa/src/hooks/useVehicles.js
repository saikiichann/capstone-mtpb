import { useEffect, useState } from 'react'
import { listVehicles } from '../firebase/vehicles'

// Loads the signed-in owner's vehicles.
// Returns { status: 'loading' | 'ready' | 'error', vehicles }.
export default function useVehicles(ownerUid) {
  const [result, setResult] = useState({ uid: null, status: 'loading', vehicles: [] })

  useEffect(() => {
    if (!ownerUid) return undefined
    let cancelled = false
    listVehicles(ownerUid)
      .then((vehicles) => {
        if (!cancelled) setResult({ uid: ownerUid, status: 'ready', vehicles })
      })
      .catch((err) => {
        console.error('Could not load vehicles', err)
        if (!cancelled) setResult({ uid: ownerUid, status: 'error', vehicles: [] })
      })
    return () => {
      cancelled = true
    }
  }, [ownerUid])

  // Until the result for this uid arrives, report loading.
  if (result.uid !== ownerUid) return { status: 'loading', vehicles: [] }
  return result
}
