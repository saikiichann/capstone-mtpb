import { useEffect, useRef, useState } from 'react'

// Counts a number up to its value when it first appears.
//
// Used only for the amounts that matter — what you owe, what you just paid —
// where the movement draws the eye to the figure. A page where every number
// ticks is a page nobody can read.
//
// Honours the phone's "reduce motion" setting by showing the value straight
// away, and always lands exactly on the target rather than near it.
const DURATION = 900

// Fast at first, easing out — the same shape as the CSS transitions.
const easeOut = (t) => 1 - (1 - t) ** 3

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  )
}

export default function useCountUp(target, { duration = DURATION, enabled = true } = {}) {
  const value = Number(target) || 0
  const animate = enabled && value !== 0 && !prefersReducedMotion()

  // Progress is stored rather than the number itself, so a new target simply
  // restarts from zero instead of jumping from the previous figure.
  const [run, setRun] = useState({ value, progress: 0 })
  const frame = useRef(0)

  // React's documented way to reset state when an input changes: adjust it
  // during render rather than in an effect, which would render twice.
  if (run.value !== value) setRun({ value, progress: 0 })

  useEffect(() => {
    if (!animate) return undefined

    const start = performance.now()
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      setRun({ value, progress })
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame.current)
  }, [animate, value, duration])

  if (!animate) return value
  // The last frame returns the exact target, so no rounding drift shows.
  return run.progress >= 1 ? value : value * easeOut(run.progress)
}
