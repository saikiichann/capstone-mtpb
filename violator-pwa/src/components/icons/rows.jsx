// Small line icons for the Profile rows. Drawn here (not exported from
// Figma), all on a 24 x 24 grid so they line up.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function Icon({ children, ...props }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
      <g {...base}>{children}</g>
    </svg>
  )
}

export function PersonIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c.9-3.6 3.8-5.4 7.2-5.4s6.3 1.8 7.2 5.4" />
    </Icon>
  )
}

export function MailIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.4" />
      <path d="m4 7.5 8 5.2 8-5.2" />
    </Icon>
  )
}

export function PhoneIcon(props) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6" />
      <path d="M10.6 18.4h2.8" />
    </Icon>
  )
}

export function PinIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 21.2c4-4 6.2-7 6.2-10.2a6.2 6.2 0 1 0-12.4 0c0 3.2 2.2 6.2 6.2 10.2Z" />
      <circle cx="12" cy="10.6" r="2.3" />
    </Icon>
  )
}

export function LicenseIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2.6" y="5" width="18.8" height="14" rx="2.4" />
      <circle cx="8.4" cy="11.2" r="2.1" />
      <path d="M5.2 16.2c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.6 10h4.2M14.6 13.6h4.2" />
    </Icon>
  )
}

export function CalendarIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3.2" y="5" width="17.6" height="15.4" rx="2.4" />
      <path d="M3.2 9.6h17.6M8 3.2v3.4M16 3.2v3.4" />
    </Icon>
  )
}

export function CardIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2.6" y="5.4" width="18.8" height="13.2" rx="2.4" />
      <path d="M2.6 10h18.8M6.4 14.8h3.6" />
    </Icon>
  )
}

export function ShieldIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 2.8 4.8 6v6c0 4.4 3 8 7.2 9.2 4.2-1.2 7.2-4.8 7.2-9.2V6Z" />
      <path d="M12 9.6v3.4" />
      <path d="M12 16.1h.01" strokeWidth="2.4" />
    </Icon>
  )
}

export function HelpIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.4v.4" />
      <path d="M12 17.2h.01" strokeWidth="2.4" />
    </Icon>
  )
}

export function BugIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3.4 21 19.6H3Z" />
      <path d="M12 9.6v4" />
      <path d="M12 16.6h.01" strokeWidth="2.4" />
    </Icon>
  )
}

export function ChatIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20.4 14.2c0 1.6-1.3 2.9-2.9 2.9H9.3L4.6 20.6v-4.2A2.9 2.9 0 0 1 3.6 14V6.8c0-1.6 1.3-2.9 2.9-2.9h11c1.6 0 2.9 1.3 2.9 2.9Z" />
    </Icon>
  )
}

export function CameraIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.4 8.6h3.2l1.6-2.6h7.6l1.6 2.6h3.2v10.2H3.4Z" />
      <circle cx="12" cy="13.4" r="3.2" />
    </Icon>
  )
}

export function FolderIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.2 6.6h6l2 2.4h9.6v10.4H3.2Z" />
    </Icon>
  )
}

export function LogoutIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14.4 7.4V5.2a2 2 0 0 0-2-2H5.8a2 2 0 0 0-2 2v13.6a2 2 0 0 0 2 2h6.6a2 2 0 0 0 2-2v-2.2" />
      <path d="M9.6 12h10.6m0 0-3.2-3.2M20.2 12l-3.2 3.2" />
    </Icon>
  )
}
