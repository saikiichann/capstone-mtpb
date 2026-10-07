import { useEffect, useRef } from 'react'

// Centered white dialog over a dimmed screen (the Figma "OVERLAY" frames).
// Uses the native <dialog>, so focus stays inside and Esc closes it.
export default function Modal({ open, onClose, labelledBy, className = '', children }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`.trim()}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(event) => {
        // Tapping the dimmed area outside the box closes it.
        if (event.target === ref.current) onClose()
      }}
    >
      {open && <div className="modal__box">{children}</div>}
    </dialog>
  )
}
