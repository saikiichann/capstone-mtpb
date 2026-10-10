// Crash reports through Sentry (checklist E5). On only in a production build
// with VITE_SENTRY_DSN set in Vercel, so local runs and previews send nothing.
// Sentry is downloaded after the app has started (about 34 KB), so it never
// slows down the first screen someone sees at the curb.
//
// Errors only: no performance tracing and no session replay (screen
// recordings would capture people's details). Before anything leaves the
// phone, personal data is scrubbed (Data Privacy Act):
// - email addresses
// - the clamp's QR scan token in /q/<token> and /scan?t=<token> (it's the
//   clamp's secret, see src/pages/ScanRedirect.jsx)
// - Philippine mobile numbers

// `?? {}`: the tests import this file outside Vite.
const env = import.meta.env ?? {}
const dsn = env.VITE_SENTRY_DSN
export const monitoringEnabled = Boolean(dsn) && Boolean(env.PROD)

const SCRUBS = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]'],
  [/\/q\/[^/?#\s"']+/g, '/q/[token]'],
  [/([?&]t=)[^&#\s"']+/g, '$1[token]'],
  [/(\+?63[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}/g, '[mobile]'],
]

export function scrubText(text) {
  return SCRUBS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text)
}

// Every string anywhere in the report, however deep.
export function scrubDeep(value) {
  return JSON.parse(JSON.stringify(value), (_key, v) => (typeof v === 'string' ? scrubText(v) : v))
}

// Set at build time in vite.config.js.
const environment = typeof __DEPLOY_ENV__ === 'string' ? __DEPLOY_ENV__ : 'production'
const release = typeof __APP_RELEASE__ === 'string' ? __APP_RELEASE__ : undefined

let sentry = null

export function startMonitoring() {
  if (!monitoringEnabled) return
  import('./sentry-client.js')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment,
        release,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        beforeSend: (event) => scrubDeep(event),
        beforeBreadcrumb: (crumb) => scrubDeep(crumb),
      })
      sentry = Sentry
    })
    .catch(() => {
      // Offline or blocked: the app works the same without crash reports.
    })
}

// For crashes React catches (src/components/ErrorBoundary.jsx). Uncaught
// errors elsewhere are picked up by Sentry itself once it has loaded.
export function reportCrash(error, componentStack) {
  sentry?.captureException(error, { contexts: { react: { componentStack } } })
}
