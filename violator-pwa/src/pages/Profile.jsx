import { useAuth } from '../auth/auth-context'
import PageHeader from '../components/PageHeader'

// Temporary Profile tab: shows who is signed in and lets you log out while
// testing. The full Figma Profile screens come in a later step.
export default function Profile() {
  const { user, profile, signOut, isDemo } = useAuth()

  return (
    <div className="page">
      <PageHeader title="Profile" />
      <main className="page__body">
        <div className="card state-card">
          <h2 className="screen-title">{profile?.full_name || user?.displayName || 'Vehicle owner'}</h2>
          <p>{user?.email}</p>
          {profile?.mobile_number && <p>{profile.mobile_number}</p>}
          {isDemo && <p className="demo-banner">Demo mode (Firebase not connected)</p>}
          <p>The full Profile screen is designed in Figma and is still to be built.</p>
          <button type="button" className="btn btn--primary" onClick={signOut}>
            Log out
          </button>
        </div>
      </main>
    </div>
  )
}
