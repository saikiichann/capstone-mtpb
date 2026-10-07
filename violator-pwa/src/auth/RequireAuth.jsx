import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth-context'

// Wraps routes that need a signed-in, verified vehicle owner (not a guest).
// Signed out → Welcome. Signed in but email not verified → Verify Email.
// Either way the original address is kept so the user comes back to it.
export default function RequireAuth() {
  const { status, user } = useAuth()
  const location = useLocation()
  const returnTo = location.pathname + location.search

  if (status === 'loading') {
    return <div className="splash" role="status" aria-label="Loading" />
  }
  if (!user) {
    return <Navigate to="/welcome" replace state={{ returnTo }} />
  }
  if (user.isGuest) {
    // Guests only get the payment screens; the rest needs an account.
    return <Navigate to="/welcome" replace state={{ returnTo }} />
  }
  if (!user.emailVerified) {
    return <Navigate to="/verify-email" replace state={{ returnTo }} />
  }
  return <Outlet />
}

// Wraps the payment screens, which guests may use too: someone who scanned
// the QR code can pay without an account (Firebase signs them in
// anonymously). Everything else stays account-only.
export function RequirePayer() {
  const { status, user, guestChoseCheckout } = useAuth()
  const location = useLocation()
  const returnTo = location.pathname + location.search

  if (status === 'loading') {
    return <div className="splash" role="status" aria-label="Loading" />
  }
  // Anonymous sign-in happens for everyone who scans a QR code, so an
  // anonymous user who never chose to pay as a guest is sent back to the
  // violation, where the Pay Now dialog asks them to decide.
  if (user?.isGuest && !guestChoseCheckout) {
    const violationRef = location.pathname.split('/')[2]
    return <Navigate to={violationRef ? `/v/${violationRef}` : '/welcome'} replace />
  }
  if (!user) {
    return <Navigate to="/welcome" replace state={{ returnTo }} />
  }
  if (!user.isGuest && !user.emailVerified) {
    return <Navigate to="/verify-email" replace state={{ returnTo }} />
  }
  return <Outlet />
}

// For Welcome / Login / Sign Up: a signed-in user skips straight past them.
export function RedirectIfSignedIn() {
  const { status, user } = useAuth()
  const location = useLocation()
  const returnTo = location.state?.returnTo || '/'

  if (status === 'loading') {
    return <div className="splash" role="status" aria-label="Loading" />
  }
  // A guest is allowed to open Sign Up / Log in: that's how they upgrade.
  if (user?.isGuest) {
    return <Outlet />
  }
  if (user && !user.emailVerified) {
    return <Navigate to="/verify-email" replace state={{ returnTo }} />
  }
  if (user) {
    return <Navigate to={returnTo} replace />
  }
  return <Outlet />
}
