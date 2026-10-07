import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import OptionalAsset from '../components/OptionalAsset'
import PageHeader from '../components/PageHeader'
import TextField from '../components/TextField'
import { authErrorMessage } from '../firebase/auth'

// Figma "SIGN UP" (527:869). Layout measured from a screenshot of the frame.
// After sign-up, <RedirectIfSignedIn> moves the user to Verify Email.

const PH_MOBILE = /^(09|\+639)\d{9}$/

function validate({ fullName, email, mobileNumber, password, confirmPassword }) {
  const errors = {}
  if (fullName.trim().length < 2) errors.fullName = 'Enter your full name.'
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = 'Enter a valid email address.'
  if (!PH_MOBILE.test(mobileNumber.replace(/[\s-]/g, ''))) {
    errors.mobileNumber = 'Use an 11-digit number like 09171234567.'
  }
  if (password.length < 8) errors.password = 'Use at least 8 characters.'
  if (confirmPassword !== password) errors.confirmPassword = 'Passwords don’t match.'
  return errors
}

export default function SignUp() {
  const { signUp } = useAuth()
  const location = useLocation()
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    mobileNumber: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [busy, setBusy] = useState(false)

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    try {
      await signUp({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        mobileNumber: form.mobileNumber.replace(/[\s-]/g, ''),
        password: form.password,
      })
    } catch (err) {
      setSubmitError(authErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <PageHeader title="Create Account" subtitle="Sign up to get started" />

      <main className="page__body auth-body signup-body">
        <OptionalAsset name="signup-avatar" width={80} height={80} className="signup-avatar" />

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Full Name"
            name="fullName"
            autoComplete="name"
            placeholder="Enter your full name"
            value={form.fullName}
            onChange={update('fullName')}
            error={errors.fullName}
          />
          <TextField
            label="Email Address"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="Enter your email"
            value={form.email}
            onChange={update('email')}
            error={errors.email}
          />
          <TextField
            label="Mobile Number"
            type="tel"
            name="mobileNumber"
            autoComplete="tel"
            inputMode="tel"
            placeholder="Enter your mobile number"
            value={form.mobileNumber}
            onChange={update('mobileNumber')}
            error={errors.mobileNumber}
          />
          <TextField
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
          />
          <TextField
            label="Confirm Password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Confirm your password"
            value={form.confirmPassword}
            onChange={update('confirmPassword')}
            error={errors.confirmPassword}
          />

          {submitError && (
            <p className="form-message form-message--error" role="alert">
              {submitError}
            </p>
          )}

          <div className="auth-form__actions signup-actions">
            <button type="submit" className="btn btn--lg btn--primary" disabled={busy}>
              {busy ? 'Creating account…' : 'Register'}
            </button>
            <p className="auth-form__switch">
              Already have an account?{' '}
              <Link className="link-accent" to="/login" state={location.state}>
                Login
              </Link>
            </p>
          </div>
        </form>
      </main>
    </div>
  )
}
