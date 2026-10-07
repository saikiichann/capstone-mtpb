import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import CompactField from '../../components/CompactField'
import PageHeader from '../../components/PageHeader'
import useFieldErrors from '../../hooks/useFieldErrors'
import { EDITABLE_FIELDS, checkProfile, cleanProfile, draftFromProfile } from './profileFields'

// Not in the Figma file: opened by "Edit Profile" on Profile Information.
// The email address isn't editable here, because changing it means verifying
// the new address again.
export default function EditProfile() {
  const { user, profile, updateProfile, sendPasswordReset } = useAuth()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => draftFromProfile(profile))
  const { errors, clearErrors, showErrors } = useFieldErrors()
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [passwordNote, setPasswordNote] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    if (showErrors(checkProfile(draft))) return

    setSaving(true)
    try {
      await updateProfile(cleanProfile(draft))
      navigate('/profile/info', { replace: true, state: { saved: true } })
    } catch (err) {
      console.error('Could not save profile', err)
      setFormError('We couldn’t save your changes. Check your connection and try again.')
      setSaving(false)
    }
  }

  async function handlePasswordReset() {
    setPasswordNote('')
    try {
      await sendPasswordReset(user.email)
      setPasswordNote(`We sent a password reset link to ${user.email}.`)
    } catch (err) {
      console.error('Could not send reset email', err)
      setPasswordNote('We couldn’t send the reset email. Please try again.')
    }
  }

  return (
    <div className="page">
      <PageHeader title="Edit Profile" back="/profile/info" />

      <main className="page__body vehicle-form-body">
        <form className="vehicle-form" onSubmit={handleSubmit} noValidate>
          {EDITABLE_FIELDS.map((field) => (
            <CompactField
              key={field.name}
              label={field.optional ? `${field.label} (optional)` : field.label}
              error={errors[field.name]}
            >
              {(props) => (
                <input
                  {...props}
                  placeholder={field.placeholder}
                  autoComplete={field.autoComplete}
                  inputMode={field.inputMode}
                  maxLength={field.maxLength}
                  value={draft[field.name]}
                  onChange={(e) => {
                    setDraft((prev) => ({ ...prev, [field.name]: e.target.value }))
                    clearErrors([field.name])
                  }}
                />
              )}
            </CompactField>
          ))}

          <div className="compact-field">
            <span className="compact-field__label">Email Address</span>
            <p className="locked-value">{user?.email}</p>
            <p className="compact-field__hint">
              Changing your email means verifying the new address, so it’s done by the MTPB office for now.
            </p>
          </div>

          <div className="edit-profile__password">
            <button type="button" className="btn btn--pay btn--outline" onClick={handlePasswordReset}>
              Change Password
            </button>
            {passwordNote && (
              <p className="form-message" role="status">
                {passwordNote}
              </p>
            )}
          </div>

          {formError && (
            <p className="form-message form-message--error" role="alert">
              {formError}
            </p>
          )}

          <div className="vehicle-form__actions vehicle-form__actions--split">
            <button
              type="button"
              className="btn btn--pay btn--outline"
              onClick={() => navigate('/profile/info', { replace: true })}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn--pay btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
