import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import gcashLogo from '../../assets/pay-gcash.webp'
import { useAuth } from '../../auth/auth-context'
import PageHeader from '../../components/PageHeader'
import { PAYMENT_METHODS } from '../../payments'
import StepIntro from '../../components/StepIntro'

// Figma "PROCEED TO PAYMENT" (step 2).
const LOGOS = { gcash: gcashLogo }
const PH_MOBILE = /^(09|\+639)\d{9}$/

export default function PayDetails() {
  const { violation } = useOutletContext()
  const { method: methodId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const method = PAYMENT_METHODS[methodId]
  const base = `/v/${encodeURIComponent(violation.id ?? violation.cin)}/pay`

  // Coming back from step 3 keeps what was typed. Otherwise the number
  // saved for this wallet (Profile → Payment Methods) is filled in.
  const saved = location.state ?? {}
  const savedWallet = profile?.wallets?.find((w) => w.provider === methodId && w.isDefault)
  const [mobileNumber, setMobileNumber] = useState(
    saved.mobileNumber ?? savedWallet?.mobileNumber ?? profile?.mobile_number ?? '',
  )
  const [email, setEmail] = useState(saved.email ?? user?.email ?? '')
  const [errors, setErrors] = useState({})

  if (!method) return <Navigate to={base} replace />

  function handleSubmit(event) {
    event.preventDefault()
    const found = {}
    const mobile = mobileNumber.replace(/[\s-]/g, '')
    if (!PH_MOBILE.test(mobile)) found.mobileNumber = 'Use an 11-digit number like 09171234567.'
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) found.email = 'Enter a valid email or leave it blank.'
    setErrors(found)
    if (Object.keys(found).length) return

    const details = { mobileNumber: mobile, email: email.trim() }
    // Remember the details on this page's history entry, so going back from
    // step 3 shows them again.
    navigate(location.pathname, { replace: true, state: details })
    navigate(`${base}/${method.id}/confirm`, { state: details })
  }

  return (
    <div className="page">
      <PageHeader title="Pay Now" back />

      <main className="page__body pay-body">
        <StepIntro step={2} title="Payment Details">
          Enter the required information to complete your payment.
        </StepIntro>

        <form className="card pay-form" onSubmit={handleSubmit} noValidate>
          <div className="pay-form__method">
            <img src={LOGOS[method.id]} width={42} height={42} alt="" />
            <span>Payment via {method.label}</span>
          </div>

          <div className="pay-field">
            <label htmlFor="pay-mobile">Mobile Number</label>
            <input
              id="pay-mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="09XX XXX XXXX"
              value={mobileNumber}
              onChange={(e) => {
                setMobileNumber(e.target.value)
                if (errors.mobileNumber) setErrors((prev) => ({ ...prev, mobileNumber: undefined }))
              }}
              aria-invalid={errors.mobileNumber ? true : undefined}
              aria-describedby={errors.mobileNumber ? 'pay-mobile-error' : undefined}
            />
            {errors.mobileNumber && (
              <p id="pay-mobile-error" className="field__error">
                {errors.mobileNumber}
              </p>
            )}
          </div>

          <div className="pay-field">
            <label htmlFor="pay-email">Email (Optional)</label>
            <input
              id="pay-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="juan.delacruz@gmail.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
              }}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby="pay-email-note"
            />
            {errors.email && <p className="field__error">{errors.email}</p>}
            <p id="pay-email-note" className="pay-field__note">
              You will receive the payment receipt in this email.
            </p>
          </div>

          <p className="pay-form__banner">
            You will be redirected to {method.label} to complete the payment.
          </p>

          <div className="pay-form__actions">
            <button type="submit" className="btn btn--pay btn--primary">
              Proceed to {method.label}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
