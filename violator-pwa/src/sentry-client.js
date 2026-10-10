// Only the two parts of Sentry the app uses, loaded on demand by
// src/monitoring.js. Importing the whole package that way would also pull in
// session replay and tracing (about 150 KB instead of about 30 KB).
export { captureException, init } from '@sentry/react'
