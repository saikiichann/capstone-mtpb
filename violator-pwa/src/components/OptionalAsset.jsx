// Icons that still need to be exported from Figma. Drop the file into
// src/assets/icons/ with the name below and it shows up automatically.
// Until then the space stays reserved (or `fallback` is shown) so the
// layout doesn't shift.
//   signup-avatar.svg    → Create Account screen, above the form
//   verify-email.svg     → Verify Email screen, the envelope with the check
//   back-arrow.svg       → ← in the black header (white icon)
//   download.svg         → Receipt header, save button (white icon)
//   pay-onsite.svg       → Pay Now step 1, the store icon (70 x 70)
//   payment-receipt.svg  → Pay Now step 3, the big receipt icon (184 x 184)
//   payment-success.svg  → Payment Successful, the green check (124 x 124)
const files = import.meta.glob('../assets/icons/*.{svg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
})

function findAsset(name) {
  const key = Object.keys(files).find((path) => path.split('/').pop().startsWith(`${name}.`))
  return key ? files[key] : null
}

export default function OptionalAsset({ name, width, height, className, fallback = null }) {
  const src = findAsset(name)
  if (src) {
    return <img className={className} src={src} width={width} height={height} alt="" />
  }
  if (fallback) return fallback
  return <span className={className} style={{ display: 'block', width, height }} aria-hidden="true" />
}
