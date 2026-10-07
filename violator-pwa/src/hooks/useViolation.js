import { useEffect, useState } from 'react'
import { getViolation } from '../firebase/violations'
import { withLocalPaymentStatus } from '../payments'

// Loads one violation by its document id, or by the QR id printed on the
// clamp (then it's the live one for that code). In demo mode, a payment made
// on this device (for the signed-in `uid`) marks it as paid.
// Returns { status: 'loading' | 'ready' | 'not-found' | 'error', violation }.
export default function useViolation(ref, uid) {
  const [result, setResult] = useState({ key: null, status: 'loading', violation: null })
  const key = `${ref}|${uid ?? ''}`

  useEffect(() => {
    let cancelled = false
    getViolation(ref)
      .then((found) => {
        if (cancelled) return
        if (!found) setResult({ key, status: 'not-found', violation: null })
        else setResult({ key, status: 'ready', violation: withLocalPaymentStatus(uid, found) })
      })
      .catch((err) => {
        console.error('Failed to load violation', err)
        if (!cancelled) setResult({ key, status: 'error', violation: null })
      })
    return () => {
      cancelled = true
    }
  }, [ref, uid, key])

  if (result.key !== key) return { status: 'loading', violation: null }
  return result
}
