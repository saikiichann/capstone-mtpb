import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import PageHeader from '../components/PageHeader'
import TextField from '../components/TextField'
import { authErrorMessage } from '../firebase/auth'

// Figma "WELCOME" (536:424) — the Login screen.
// After a successful login, <RedirectIfSignedIn> sends the user on to
// wherever they came from (e.g. the violation they scanned).
export default function Login() {
  const { signIn, sendPasswordReset } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      await signIn({ email: email.trim(), password })
    } catch (err) {
      setError(authErrorMessage(err))
      setBusy(false)
    }
  }

  async function handleForgotPassword() {
    setError('')
    setNotice('')
    if (!email.trim()) {
      setError('Enter your email address first, then tap “Forgot password?” again.')
      return
    }
    try {
      await sendPasswordReset(email.trim())
      setNotice(`If an account exists for ${email.trim()}, we sent a password reset link.`)
    } catch (err) {
      setError(authErrorMessage(err))
    }
  }

  return (
    <div className="page">
      <PageHeader size="lg" title="Welcome Back!" subtitle="Login to continue" />

      <main className="page__body auth-body">
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email Address"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="button" className="link-accent auth-form__forgot" onClick={handleForgotPassword}>
            Forgot password?
          </button>

          {error && (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="form-message" role="status">
              {notice}
            </p>
          )}

          <div className="auth-form__actions">
            <button type="submit" className="btn btn--lg btn--primary" disabled={busy}>
              {busy ? 'Logging in…' : 'Login'}
            </button>
            <p className="auth-form__or">or</p>
            <Link className="btn btn--lg btn--outline" to="/signup" state={location.state}>
              Create an account
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}
