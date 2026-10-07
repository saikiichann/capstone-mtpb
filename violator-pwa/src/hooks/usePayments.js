import { useEffect, useState } from 'react'
import { listPayments } from '../payments'
import { toMillis } from '../utils/format'

// Loads this owner's payments once.
export default function usePayments(uid) {
  const [result, setResult] = useState({ uid: null, status: 'loading', payments: [] })

  useEffect(() => {
    if (!uid) return undefined
    let cancelled = false
    listPayments(uid)
      .then((payments) => {
        if (!cancelled) {
          setResult({
            uid,
            status: 'ready',
            payments: payments.sort((a, b) => toMillis(b.paidAt ?? b.createdAt) - toMillis(a.paidAt ?? a.createdAt)),
          })
        }
      })
      .catch((err) => {
        console.error('Could not load payments', err)
        if (!cancelled) setResult({ uid, status: 'error', payments: [] })
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  if (result.uid !== uid) return { status: 'loading', payments: [] }
  return result
}
