import { Link } from 'react-router-dom'

// One row of a settings list: icon, title, optional description or value,
// and a chevron. Renders as a link, a button or a plain row.
export default function SettingsRow({ icon, title, description, value, to, href, onClick, last }) {
  const content = (
    <>
      {icon && <span className="settings-row__icon">{icon}</span>}
      <span className="settings-row__text">
        <span className="settings-row__title">{title}</span>
        {description && <span className="settings-row__description">{description}</span>}
      </span>
      {value && <span className="settings-row__value">{value}</span>}
      {(to || href || onClick) && (
        <span className="settings-row__chevron" aria-hidden="true">
          &gt;
        </span>
      )}
    </>
  )
  const className = `settings-row${last ? ' settings-row--last' : ''}`

  if (to) {
    return (
      <Link className={className} to={to}>
        {content}
      </Link>
    )
  }
  if (href) {
    return (
      <a className={className} href={href}>
        {content}
      </a>
    )
  }
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    )
  }
  return <div className={className}>{content}</div>
}
