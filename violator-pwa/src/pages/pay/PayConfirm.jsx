import { useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import OptionalAsset from '../../components/OptionalAsset'
import PageHeader from '../../components/PageHeader'
import { PAYMENT_METHODS, startPayment } from '../../payments'
import { computeCharges } from '../../payments/fees'
import { formatPeso } from '../../utils/format'
import StepIntro from '../../components/StepIntro'

// Figma "PAYMENT CONFIRMATION" (step 3) → "LOADING PAYMENT".
// With PayMongo, confirming sends the browser to PayMongo's GCash
// test page; PayMongo then returns to /payments/<ref>/success.
export default function PayConfirm() {
  const { violation } = useOutletContext()
  const { method: methodId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const submittedRef = useRef(false)

  const method = PAYMENT_METHODS[methodId]
  const details = location.state
  const base = `/v/${encodeURIComponent(violation.id ?? violation.cin)}/pay`

  // Opened without going through step 2 (e.g. after a refresh).
  if (!method || !details?.mobileNumber) {
    return <Navigate to={method ? `${base}/${method.id}` : base} replace />
  }

  const charges = computeCharges(violation.fineAmount, method.id)

  async function handleConfirm() {
    if (submittedRef.current) return
    submittedRef.current = true
    setError('')
    setProcessing(true)
    try {
      const result = await startPayment({
        uid: user.uid,
        violation,
        method: method.id,
        mobileNumber: details.mobileNumber,
        email: details.email,
      })
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl)
        return // keep showing the processing screen while the page changes
      }
      navigate(`/payments/${encodeURIComponent(result.paymentId)}/success`, { replace: true })
    } catch (err) {
      // Already paid (maybe in cash at the office, which has no receipt in
      // the app): the violation page shows where it stands.
      if (err?.status === 409) {
        navigate(`/v/${encodeURIComponent(violation.id ?? violation.cin)}`, { replace: true })
        return
      }
      console.error('Payment could not start', err)
      setError(err?.message || 'The payment didn’t go through. Please try again.')
      setProcessing(false)
      submittedRef.current = false
    }
  }

  if (processing) return <ProcessingPayment />

  return (
    <div className="page">
      <PageHeader title="Pay Now" back />

      <main className="page__body pay-body confirm-body">
        <StepIntro step={3} title="Payment Confirmation">
          Please confirm your payment to finalize the transaction.
        </StepIntro>

        <OptionalAsset name="payment-receipt" width={184} height={184} className="confirm-body__icon" />

        <p className="confirm-body__label">Total Amount Due</p>
        <p className="confirm-body__amount">{formatPeso(charges.total)}</p>
        {charges.fee > 0 && (
          <p className="confirm-body__breakdown">
            Fine {formatPeso(charges.fine)} + {method.label} convenience fee {formatPeso(charges.fee)}
          </p>
        )}

        <div className="confirm-body__footer">
          <p className="confirm-body__terms">
            By continuing, you agree to our
            <br />
            <strong>Terms of Service</strong> and <strong>Privacy Policy.</strong>
          </p>
          {error && (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn btn--pay btn--primary" onClick={handleConfirm}>
            Confirm Payment
          </button>
          <button
            type="button"
            className="btn btn--pay btn--outline"
            onClick={() => navigate(`/v/${encodeURIComponent(violation.id ?? violation.cin)}`)}
          >
            Cancel
          </button>
        </div>
      </main>
    </div>
  )
}

export function ProcessingPayment({ lines = ['Processing your payment...', 'Please wait.'] }) {
  return (
    <div className="page processing-page" role="status" aria-live="polite">
      <div className="processing-ring" aria-hidden="true" />
      <p className="processing-page__text">
        {lines[0]}
        <br />
        {lines[1]}
      </p>
    </div>
  )
}
