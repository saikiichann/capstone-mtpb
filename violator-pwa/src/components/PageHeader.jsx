import { useNavigate } from 'react-router-dom'
import OptionalAsset from './OptionalAsset'

// Black header with rounded bottom corners, shared by every screen.
// - `title` (+ optional `subtitle`) for a centered screen title
// - `greeting` + `name` for the dashboard version
// - `size="lg"` for the taller Login header
// - `back` shows the ← button: `true` goes to the previous page, a path goes
//   there, and `{ to, state }` goes there with router state
// - `action` is shown on the right (e.g. the Receipt download button)
export default function PageHeader({ title, subtitle, greeting, name, size, back, action }) {
  if (greeting || name) {
    return (
      <header className="page-header page-header--greeting">
        {greeting && <p className="page-header__greeting">{greeting}</p>}
        {name && <h1 className="page-header__name">{name}</h1>}
      </header>
    )
  }

  const classes = [
    'page-header',
    subtitle && 'page-header--with-subtitle',
    size === 'lg' && 'page-header--lg',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <header className={classes}>
      {back && (
        <BackButton
          to={back === true ? null : (back.to ?? back)}
          state={typeof back === 'object' ? back.state : undefined}
        />
      )}
      <h1 className="page-header__title">{title}</h1>
      {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      {action && <div className="page-header__action">{action}</div>}
    </header>
  )
}

function BackButton({ to, state }) {
  const navigate = useNavigate()

  function goBack() {
    if (to) navigate(to, { state })
    // Opened straight from a link, there's no page to go back to.
    else if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
    else navigate('/')
  }

  return (
    <button type="button" className="header-icon-btn page-header__back" onClick={goBack} aria-label="Go back">
      <OptionalAsset
        name="back-arrow"
        width={20}
        height={20}
        fallback={<span className="header-icon-btn__glyph" aria-hidden="true">←</span>}
      />
    </button>
  )
}
