import { useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import OptionalAsset from '../../components/OptionalAsset'
import LanguageToggle from '../../components/LanguageToggle'
import PageHeader from '../../components/PageHeader'
import { PAYMENT_METHODS, startPayment } from '../../payments'
import { computeCharges } from '../../payments/fees'
import { formatPeso } from '../../utils/format'
import StepIntro from '../../components/StepIntro'
import { useT } from '../../i18n/language-context'

// Figma "PAYMENT CONFIRMATION" (step 3) → "LOADING PAYMENT".
// With PayMongo, confirming sends the browser to PayMongo's GCash
// test page; PayMongo then returns to /payments/<ref>/success.
export default function PayConfirm() {
  const { violation } = useOutletContext()
  const t = useT()
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
      setError(err?.message || t('pay.confirm.failed'))
      setProcessing(false)
      submittedRef.current = false
    }
  }

  if (processing) return <ProcessingPayment />

  return (
    <div className="page">
      <PageHeader title={t('pay.title')} back action={<LanguageToggle />} />

      <main className="page__body pay-body confirm-body">
        <StepIntro step={3} title={t('pay.confirm.title')}>
          {t('pay.confirm.text')}
        </StepIntro>

        <OptionalAsset name="payment-receipt" width={184} height={184} className="confirm-body__icon" />

        <p className="confirm-body__label">{t('pay.confirm.total')}</p>
        <p className="confirm-body__amount">{formatPeso(charges.total)}</p>
        {charges.fee > 0 && (
          <p className="confirm-body__breakdown">
            {t('pay.confirm.breakdown', { fine: formatPeso(charges.fine), method: method.label, fee: formatPeso(charges.fee) })}
          </p>
        )}

        <div className="confirm-body__footer">
          <p className="confirm-body__terms">
            {t('pay.confirm.agree')}
            <br />
            <strong>{t('pay.confirm.terms')}</strong> {t('pay.confirm.and')} <strong>{t('pay.confirm.privacy')}</strong>
          </p>
          {error && (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn btn--pay btn--primary" onClick={handleConfirm}>
            {t('pay.confirm.button')}
          </button>
          <button
            type="button"
            className="btn btn--pay btn--outline"
            onClick={() => navigate(`/v/${encodeURIComponent(violation.id ?? violation.cin)}`)}
          >
            {t('pay.confirm.cancel')}
          </button>
        </div>
      </main>
    </div>
  )
}

export function ProcessingPayment({ lines }) {
  const t = useT()
  const [first, second] = lines ?? [t('pay.processing'), t('common.pleaseWait')]
  return (
    <div className="page processing-page" role="status" aria-live="polite">
      <div className="processing-ring" aria-hidden="true" />
      <p className="processing-page__text">
        {first}
        <br />
        {second}
      </p>
    </div>
  )
}
