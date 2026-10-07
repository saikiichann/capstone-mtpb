import { useEffect, useState } from 'react'
import { subscribeToPayment } from '../payments'

// Watches one payment by reference number.
// Returns { status: 'loading' | 'ready' | 'missing' | 'error', payment }.
export default function usePayment(uid, referenceNumber) {
  const key = `${uid}|${referenceNumber}`
  const [result, setResult] = useState({ key: null, status: 'loading', payment: null })

  useEffect(() => {
    if (!uid || !referenceNumber) return undefined
    return subscribeToPayment(
      uid,
      referenceNumber,
      (payment) => setResult({ key, status: payment ? 'ready' : 'missing', payment }),
      (err) => {
        console.error('Could not load payment', err)
        setResult({ key, status: 'error', payment: null })
      },
    )
  }, [uid, referenceNumber, key])

  if (result.key !== key) return { status: 'loading', payment: null }
  return result
}
