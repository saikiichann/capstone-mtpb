// Remembers, on this phone, the QR scan token that opened each violation.
// The server only shows a guest a violation whose clamp they scanned
// (server/violation-access.js), so the violation page and Pay Now send the
// token along. Kept in localStorage so it survives the trip out to GCash and
// back; only the last few are kept.

const KEY = 'mtpb-scan-tokens'
const KEEP = 10

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

// `refs`: the violation's id and violation number, either of which may be in
// a link.
export function rememberScanToken(refs, token) {
  const keys = refs.filter(Boolean)
  if (!token || keys.length === 0) return
  const others = read().filter((entry) => !keys.some((k) => entry.refs.includes(k)))
  try {
    localStorage.setItem(KEY, JSON.stringify([{ refs: keys, token }, ...others].slice(0, KEEP)))
  } catch {
    // Storage unavailable: owners still see their own violations; a guest
    // would have to scan again.
  }
}

export function scanTokenFor(ref) {
  if (!ref) return null
  return read().find((entry) => entry.refs.includes(ref))?.token ?? null
}
