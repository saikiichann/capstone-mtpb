import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import Modal from '../components/Modal'
import { useT } from '../i18n/language-context'

// Shown when someone who scanned the QR code taps "Pay Now" without being
// signed in: pay straight away as a guest, or make an account first.
export default function PayChoiceDialog({ open, violationRef, onClose }) {
  const { continueAsGuest } = useAuth()
  const t = useT()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const returnTo = `/v/${encodeURIComponent(violationRef)}`
  const payPath = `${returnTo}/pay`

  async function payAsGuest() {
    setBusy(true)
    setError('')
    try {
      await continueAsGuest()
      navigate(payPath)
    } catch (err) {
      console.error('Could not start guest payment', err)
      setError(t('choice.error'))
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} labelledBy="pay-choice-title" className="confirm-modal">
      <h2 id="pay-choice-title" className="confirm-modal__title">
        {t('choice.title')}
      </h2>
      <p className="confirm-modal__text">
        {t('choice.text')}
      </p>

      {error && (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      )}

      <div className="choice-actions">
        <button type="button" className="btn btn--pay btn--primary" onClick={payAsGuest} disabled={busy}>
          {busy ? t('choice.wait') : t('choice.guest')}
        </button>
        {/* Goes to the Welcome screen rather than straight to the form, so
            someone new meets the app before signing up. Welcome passes this
            state on to Sign Up, which is how they land back on the violation
            once the account is made. */}
        <Link className="btn btn--pay btn--outline" to="/welcome" state={{ returnTo }}>
          {t('choice.create')}
        </Link>
        <Link className="text-button" to="/login" state={{ returnTo }}>
          {t('choice.haveAccount')}
        </Link>
      </div>
    </Modal>
  )
}
