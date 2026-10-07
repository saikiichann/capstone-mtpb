import { Link } from 'react-router-dom'

// A row card from the dashboard's "Quick Access" list: grey icon circle,
// bold title, one-line description and a chevron.
//
// `badge` shows a count on the right — used only for unpaid violations, so
// the one row that needs attention is the one that draws the eye.
export default function QuickAccessItem({ to, title, description, icon, badge, tone }) {
  return (
    <Link
      to={to}
      className={`quick-access-item${tone ? ` quick-access-item--${tone}` : ''}${badge ? ' quick-access-item--flagged' : ''}`}
    >
      <span className="quick-access-item__icon">{icon}</span>
      <span className="quick-access-item__text">
        <span className="quick-access-item__title">{title}</span>
        <span className="quick-access-item__description">{description}</span>
      </span>
      {badge ? (
        <span className="quick-access-item__badge" aria-label={`${badge} needing attention`}>
          {badge}
        </span>
      ) : null}
      <span className="quick-access-item__chevron" aria-hidden="true">
        &gt;
      </span>
    </Link>
  )
}
