import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import PageHeader from '../../components/PageHeader'
import { CalendarIcon, MailIcon, PersonIcon, PhoneIcon, PinIcon } from '../../components/icons/rows'
import ProfileAvatar from './ProfileAvatar'
import { memberSince } from './profileFields'

// Figma "PROFILE INFO".
//
// A hero card in the same style as Home's vehicle card, then each detail on
// its own line: coloured icon tile, small label, value underneath. Stacking
// the label over the value gives long values like an email address the
// full width instead of squeezing them into half a row.
export default function ProfileInformation() {
  const { user, profile } = useAuth()
  const saved = useLocation().state?.saved
  const name = profile?.full_name || user?.displayName || 'Vehicle owner'
  const rows = [
    { tone: 'blue', icon: <PersonIcon />, label: 'Full Name', value: name },
    { tone: 'violet', icon: <MailIcon />, label: 'Email Address', value: breakEmail(user?.email) },
    { tone: 'green', icon: <PhoneIcon />, label: 'Mobile Number', value: profile?.mobile_number },
    { tone: 'amber', icon: <PinIcon />, label: 'Address', value: profile?.address },
    { tone: 'teal', icon: <CalendarIcon />, label: 'Date Registered', value: memberSince(profile) || null },
  ]

  return (
    <div className="page">
      <PageHeader title="Profile Information" back="/profile" />

      <main className="page__body settings-body">
        {saved && (
          <p className="form-message vehicle-details__saved" role="status">
            Profile updated.
          </p>
        )}

        <section className="profile-hero" aria-label="Your profile">
          <span className="profile-hero__ring">
            <ProfileAvatar name={name} size={68} />
          </span>
          <div className="profile-hero__text">
            <h2 className="profile-hero__name">{name}</h2>
            {user?.email && <p className="profile-hero__line">{breakEmail(user.email)}</p>}
            {profile?.mobile_number && <p className="profile-hero__line">{profile.mobile_number}</p>}
          </div>
        </section>

        <section className="settings-group" aria-label="Personal details">
          <h3 className="settings-group__title">Personal Details</h3>
          <ul className="card profile-details">
            {rows.map((row, index) => (
              <li key={row.label} className={`profile-detail profile-detail--${row.tone}`} style={{ '--i': index }}>
                <span className="profile-detail__icon">{row.icon}</span>
                <span className="profile-detail__text">
                  <span className="profile-detail__label">{row.label}</span>
                  <span className="profile-detail__value">
                    {row.value || <span className="settings-row__empty">Not set</span>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <Link className="btn btn--pay btn--outline profile-edit-btn" to="/profile/edit">
          Edit Profile
        </Link>
      </main>
    </div>
  )
}

// Lets a long address wrap after the @ ("name@" / "gmail.com") instead of
// breaking somewhere in the middle of a word.
function breakEmail(email) {
  if (!email) return email
  const at = email.indexOf('@')
  if (at < 0) return email
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  )
}
