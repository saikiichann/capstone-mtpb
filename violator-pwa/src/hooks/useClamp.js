import { useEffect, useState } from 'react'
import { resolveClamp } from '../firebase/clamps'
import { withLocalPaymentStatus } from '../payments'

// Looks up the clamp behind a scanned QR code and the violation on it.
// Returns { status: 'loading' | 'ready' | 'error', clamp }
// where clamp is { found, clampId, status, violation }.
export default function useClamp(clampId, uid) {
  const key = `${clampId}|${uid ?? ''}`
  const [result, setResult] = useState({ key: null, status: 'loading', clamp: null })

  useEffect(() => {
    let cancelled = false
    resolveClamp(clampId)
      .then((clamp) => {
        if (cancelled) return
        const violation = clamp.violation ? withLocalPaymentStatus(uid, clamp.violation) : null
        setResult({ key, status: 'ready', clamp: { ...clamp, violation } })
      })
      .catch((err) => {
        console.error('Could not load the scanned clamp', err)
        if (!cancelled) setResult({ key, status: 'error', clamp: null })
      })
    return () => {
      cancelled = true
    }
  }, [clampId, uid, key])

  if (result.key !== key) return { status: 'loading', clamp: null }
  return result
}
