// Plate number helpers shared by the app and the server (no Firebase or
// browser code here, so server/ can import it).

// "abc  1234 " → "ABC 1234". Violations are matched on the exact plate
// text, so the enforcer app should save plates the same way.
export function normalizePlate(value = '') {
  return value.toUpperCase().trim().replace(/\s+/g, ' ')
}

// Same plate even if spaces or dashes differ ("ABC-1234" = "ABC 1234").
export function samePlate(a, b) {
  const key = (v) => normalizePlate(v).replace(/[\s-]/g, '')
  return key(a) === key(b)
}

// The ways a plate might have been typed by the enforcer app:
// "ABC 1234", "ABC1234", "ABC-1234". Firestore only finds exact matches.
export function plateSpellings(plate) {
  const clean = normalizePlate(plate)
  const compact = clean.replace(/[\s-]/g, '')
  const parts = clean.split(/[\s-]+/)
  return [...new Set([plate, clean, compact, parts.join(' '), parts.join('-')])].filter(Boolean)
}
