// Photos the enforcer took when the clamp went on, shown on Violation
// Details. The enforcer app may store them as plain URLs or as
// { url, caption, takenAt }, so both are accepted.
export function evidencePhotosOf(violation) {
  const raw = violation?.evidencePhotos ?? violation?.photos ?? violation?.evidence ?? []
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, index) => {
      const url = typeof item === 'string' ? item : item?.url ?? item?.downloadUrl ?? ''
      const caption = typeof item === 'string' ? '' : (item?.caption ?? '')
      return url ? { url, caption, key: `${url}-${index}` } : null
    })
    .filter(Boolean)
}
