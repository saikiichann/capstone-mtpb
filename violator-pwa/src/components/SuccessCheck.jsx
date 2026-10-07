// The moment the payment lands.
//
// A ring draws itself, then the tick strokes across it. It's the one place in
// this app worth a real animation: someone has just handed over money for a
// clamped car, and a drawn tick reads as "that worked" far more strongly than
// a static icon appearing.
//
// Pure SVG stroke animation — no library, no images, and it scales to any
// size without blurring. Under prefers-reduced-motion the finished mark is
// simply shown (see App.css).
export default function SuccessCheck({ size = 124 }) {
  return (
    <svg
      className="success-check"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Payment successful"
    >
      {/* The soft halo that pulses outward once. */}
      <circle className="success-check__halo" cx="60" cy="60" r="52" />
      {/* The ring, drawn clockwise from the top. */}
      <circle className="success-check__ring" cx="60" cy="60" r="52" />
      {/* The tick, drawn left to right once the ring is round. */}
      <path className="success-check__tick" d="M38 61.5 L53 76 L83 45" />
    </svg>
  )
}
