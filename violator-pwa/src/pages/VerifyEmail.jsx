import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import OptionalAsset from '../components/OptionalAsset'
import PageHeader from '../components/PageHeader'
import { authErrorMessage, takeVerificationProblem } from '../firebase/auth'

// Figma "EMAIL VERIFY" (536:492). Layout measured from a screenshot.
const RESEND_COOLDOWN = 45 // seconds, as shown in the design "(00:45)"

// "Open Email" can't open every inbox, so link the common webmail apps
// and fall back to the device's mail app.
function inboxUrl(email = '') {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  if (domain === 'gmail.com') return 'https://mail.google.com/mail/'
  if (['outlook.com', 'hotmail.com', 'live.com'].includes(domain)) return 'https://outlook.live.com/mail/'
  if (domain.startsWith('yahoo.')) return 'https://mail.yahoo.com/'
  return 'mailto:'
}

function formatCountdown(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export default function VerifyEmail() {
  const { status, user, isDemo, refreshUser, resendVerification, markVerifiedDemo, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const returnTo = location.state?.returnTo || '/'
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN)
  const [message, setMessage] = useState('')
  // If sign-up couldn't send the email, say so straight away rather than
  // letting someone wait on an inbox that will never get anything.
  const [error, setError] = useState(() => {
    const code = takeVerificationProblem()
    if (!code) return ''
    return `We couldn’t send the verification email. ${authErrorMessage({ code })}`
  })

  // Count down the resend timer.
  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  // Check every few seconds (and when the tab regains focus) whether the
  // link was clicked, then continue automatically.
  useEffect(() => {
    if (!user || user.emailVerified) return undefined
    let stopped = false
    const check = async () => {
      try {
        if ((await refreshUser()) && !stopped) navigate(returnTo, { replace: true })
      } catch {
        // Offline or token issue: try again on the next tick.
      }
    }
    const interval = setInterval(check, 4000)
    window.addEventListener('focus', check)
    return () => {
      stopped = true
      clearInterval(interval)
      window.removeEventListener('focus', check)
    }
  }, [user, refreshUser, navigate, returnTo])

  if (status === 'loading') return <div className="splash" role="status" aria-label="Loading" />
  if (!user) return <Navigate to="/welcome" replace />
  if (user.emailVerified) return <Navigate to={returnTo} replace />

  async function handleResend() {
    setMessage('')
    setError('')
    try {
      await resendVerification()
      setMessage('We sent a new verification link.')
      setCooldown(RESEND_COOLDOWN)
    } catch (err) {
      setError(authErrorMessage(err))
    }
  }

  return (
    <div className="page">
      <PageHeader title="Verify Email" />

      <main className="page__body verify-body">
        <OptionalAsset name="verify-email" width={126} height={111} className="verify-illustration" />

        <div className="verify-text">
          <p>We’ve sent a verification link to</p>
          <p className="verify-text__email">{user.email}</p>
          <p className="verify-text__instructions">
            Please check your email and click the link to verify your account.
          </p>
          {/* Firebase sends from noreply@<project>.firebaseapp.com, which
              Gmail and Outlook often filter. Saying so saves a support call. */}
          <p className="verify-text__spam">
            It can take a minute to arrive. If it isn’t there, check your spam or junk folder.
          </p>
        </div>

        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="form-message form-message--error" role="alert">
            {error}
          </p>
        )}

        <div className="verify-actions">
          {isDemo && (
            <button type="button" className="btn btn--outline" onClick={markVerifiedDemo}>
              Mark as verified (demo mode)
            </button>
          )}
          <a
            className="btn btn--lg btn--primary"
            href={inboxUrl(user.email)}
            target="_blank"
            rel="noreferrer"
          >
            Open Email
          </a>
          <button
            type="button"
            className="btn btn--lg btn--muted"
            onClick={handleResend}
            disabled={cooldown > 0}
          >
            {cooldown > 0 ? `Resend Email (${formatCountdown(cooldown)})` : 'Resend Email'}
          </button>
          <button type="button" className="text-button" onClick={signOut}>
            Use a different account
          </button>
        </div>
      </main>
    </div>
  )
}
