import { useAuth } from '../../auth/auth-context'
import PageHeader from '../../components/PageHeader'
import SettingsRow from '../../components/SettingsRow'
import { CardIcon, HelpIcon, LogoutIcon, PersonIcon, ShieldIcon } from '../../components/icons/rows'
import ProfileAvatar from './ProfileAvatar'
import { memberSince } from './profileFields'

// Figma "PROFILE" (Account Settings). It's the Profile tab, so it keeps the
// bottom bar and has no back arrow (the design shows one).
// The top card shares Profile Information's hero style; the settings list
// below is the original grouped layout.
export default function AccountSettings() {
  const { user, profile, signOut } = useAuth()
  const name = profile?.full_name || user?.displayName || 'Vehicle owner'
  const since = memberSince(profile)

  return (
    <div className="page">
      <PageHeader title="Account Settings" />

      <main className="page__body settings-body">
        <section className="profile-hero" aria-label="Your account">
          <span className="profile-hero__ring">
            <ProfileAvatar name={name} size={64} />
          </span>
          <div className="profile-hero__text">
            <h2 className="profile-hero__name">{name}</h2>
            {user?.email && <p className="profile-hero__line">{user.email}</p>}
            {profile?.mobile_number && <p className="profile-hero__line">{profile.mobile_number}</p>}
            {since && <p className="profile-hero__chip">Member since {since}</p>}
          </div>
        </section>

        <SettingsGroup title="Account">
          <SettingsRow
            icon={<PersonIcon />}
            title="Profile Information"
            description="View and edit your personal details"
            to="/profile/info"
          />
          <SettingsRow
            icon={<CardIcon />}
            title="Payment Methods"
            description="Manage your saved payment options"
            to="/profile/payment-methods"
            last
          />
        </SettingsGroup>

        <SettingsGroup title="Preferences">
          <SettingsRow
            icon={<ShieldIcon />}
            title="Privacy"
            description="Manage your privacy settings"
            to="/profile/privacy"
            last
          />
        </SettingsGroup>

        <SettingsGroup title="Support">
          <SettingsRow
            icon={<HelpIcon />}
            title="Help & Support"
            description="FAQs, contact support, feedback"
            to="/profile/support"
            last
          />
        </SettingsGroup>

        <button type="button" className="btn btn--pay btn--danger-outline logout-btn" onClick={signOut}>
          <LogoutIcon width={18} height={18} />
          Log Out
        </button>
      </main>
    </div>
  )
}

function SettingsGroup({ title, children }) {
  return (
    <section className="settings-group" aria-label={title}>
      <h2 className="settings-group__title">{title}</h2>
      <div className="card settings-group__list">{children}</div>
    </section>
  )
}
