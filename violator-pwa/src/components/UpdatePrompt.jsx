import { useRegisterSW } from 'virtual:pwa-register/react'

// How often an open app asks the server for a new version. People leave the
// installed app open for days, so checking only at launch isn't enough.
const CHECK_EVERY_MS = 60 * 60 * 1000

// "A new version is available": shown when a new build has been downloaded
// and is waiting. Refresh switches to it; until then the phone keeps the
// version it has, so nothing changes in the middle of a payment.
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => {})
      }, CHECK_EVERY_MS)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="update-prompt" role="status">
      <p className="update-prompt__text">A new version of the app is available.</p>
      <div className="update-prompt__actions">
        <button type="button" className="update-prompt__later" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
        <button type="button" className="update-prompt__refresh" onClick={() => updateServiceWorker(true)}>
          Refresh
        </button>
      </div>
    </div>
  )
}
