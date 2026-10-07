// Placeholder shapes shown while data loads.
//
// A shape roughly where the content will be reads as faster than the word
// "Loading", and the layout doesn't jump when the real rows arrive. Screen
// readers get a single "Loading" announcement rather than a wall of boxes,
// so the shapes themselves are hidden from them.

// One grey block. `lines` draws several stacked bars instead.
export function Skeleton({ width, height, className = '', style }) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{ display: 'block', width, height, ...style }}
      aria-hidden="true"
    />
  )
}

// Stand-in for a list of history or violation cards.
export function SkeletonList({ rows = 3, label = 'Loading' }) {
  return (
    <ul className="skeleton-list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <Skeleton className="skeleton-card" />
        </li>
      ))}
    </ul>
  )
}

// Stand-in for a block of text, e.g. inside a card.
export function SkeletonText({ lines = 3, lastWidth = '60%' }) {
  return (
    <span aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="skeleton-line"
          width={i === lines - 1 ? lastWidth : '100%'}
        />
      ))}
    </span>
  )
}
