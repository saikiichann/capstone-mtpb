// Limits how often one network address can call the payment API (checklist
// S4), so nobody can flood it and use up the Firestore and PayMongo quotas
// the whole system shares.
//
// Kept in memory, per Vercel instance: a burst from one address mostly lands
// on the same warm instance, which is what this is for. The per-person limit
// in payments-service.js (stored in Firestore) holds across instances.

export function createRateLimiter({ limit, windowMs, maxKeys = 5000, now = Date.now }) {
  const hits = new Map() // key → times of recent calls, oldest first

  return {
    // { ok: true } when allowed (and counted), else { ok: false, retryAfter }
    // in seconds.
    take(key) {
      const time = now()
      const recent = (hits.get(key) ?? []).filter((t) => t > time - windowMs)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return { ok: false, retryAfter: Math.max(1, Math.ceil((recent[0] + windowMs - time) / 1000)) }
      }
      recent.push(time)
      // Re-inserted so the Map stays in last-used order; the oldest address
      // is dropped once there are too many to remember.
      hits.delete(key)
      hits.set(key, recent)
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value)
      return { ok: true }
    },
  }
}

// The caller's address as Vercel reports it.
export function clientIp(request) {
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  const forwarded = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
  return forwarded || 'unknown'
}
