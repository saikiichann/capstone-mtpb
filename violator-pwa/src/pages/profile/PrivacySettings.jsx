import { useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import { CameraIcon, FolderIcon } from '../../components/icons/rows'

// Figma "PRIVACY". The phone's browser grants camera and file access, not
// the app, so this shows the real state and where to change it instead of
// switches that wouldn't do anything.
const STATUS_TEXT = {
  granted: { label: 'Allowed', tone: 'success' },
  denied: { label: 'Blocked', tone: 'danger' },
  prompt: { label: 'Asks first', tone: 'neutral' },
  unknown: { label: 'Set by your browser', tone: 'neutral' },
}

export default function PrivacySettings() {
  const camera = useCameraPermission()

  return (
    <div className="page">
      <PageHeader title="Privacy" back="/profile" />

      <main className="page__body settings-body">
        <h2 className="settings-group__title settings-group__title--lg">Permissions</h2>
        <p className="settings-hint">
          Your phone controls these, so they’re changed in the browser’s site settings, not here.
        </p>

        <div className="card settings-group__list">
          <PermissionRow
            icon={<CameraIcon />}
            title="Camera Access"
            description="Used when you take a photo of your OR/CR instead of picking a file."
            status={camera}
          />
          <PermissionRow
            icon={<FolderIcon />}
            title="File Upload Access"
            description="You pick each file yourself, so the app never browses your storage."
            status="always"
            last
          />
        </div>

        {camera === 'denied' && (
          <p className="info-note">
            Camera access is blocked. In Chrome, tap the lock icon in the address bar → <strong>Permissions</strong>{' '}
            → allow Camera, then reload the app.
          </p>
        )}

        <h2 className="settings-group__title settings-group__title--lg">What MTPB keeps</h2>
        <div className="card privacy-card">
          <ul className="privacy-list">
            <li>Your name, email, mobile number and (if you add them) address and licence number.</li>
            <li>Your registered vehicles and their OR/CR details, used to verify that they’re yours.</li>
            <li>Violations recorded against your plates, and the payments you make for them.</li>
            <li>
              Payments are processed by PayMongo. The app never sees your GCash password, and card or
              wallet credentials are never stored here.
            </li>
          </ul>
          <p className="privacy-card__note">
            To correct or remove your details, contact the MTPB office through Help &amp; Support.
          </p>
        </div>
      </main>
    </div>
  )
}

function PermissionRow({ icon, title, description, status, last }) {
  const info = status === 'always' ? { label: 'You pick each file', tone: 'neutral' } : STATUS_TEXT[status]

  return (
    <div className={`settings-row settings-row--stacked${last ? ' settings-row--last' : ''}`}>
      <span className="settings-row__icon">{icon}</span>
      <span className="settings-row__text">
        <span className="settings-row__title">{title}</span>
        <span className="settings-row__description">{description}</span>
      </span>
      <span className={`permission-chip permission-chip--${info.tone}`}>{info.label}</span>
    </div>
  )
}

// 'granted' | 'denied' | 'prompt' | 'unknown'
function useCameraPermission() {
  const [state, setState] = useState('unknown')

  useEffect(() => {
    let status
    let cancelled = false
    const onChange = () => !cancelled && setState(status.state)

    navigator.permissions
      ?.query({ name: 'camera' })
      .then((result) => {
        if (cancelled) return
        status = result
        setState(result.state)
        result.addEventListener('change', onChange)
      })
      // Safari and Firefox don't report the camera permission.
      .catch(() => {})

    return () => {
      cancelled = true
      status?.removeEventListener('change', onChange)
    }
  }, [])

  return state
}
