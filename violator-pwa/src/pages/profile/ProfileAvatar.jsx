// Round avatar with the owner's initials (no photo upload yet).
export default function ProfileAvatar({ name, size = 58 }) {
  const initials = (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <span className="profile-avatar" style={{ width: size, height: size, fontSize: Math.round(size / 2.6) }}>
      {initials || (
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="8" r="3.6" />
            <path d="M4.8 20c.9-3.6 3.8-5.4 7.2-5.4s6.3 1.8 7.2 5.4" />
          </g>
        </svg>
      )}
    </span>
  )
}
