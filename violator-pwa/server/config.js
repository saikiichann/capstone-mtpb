// Backend settings, read from Vercel environment variables.
// Set them in Vercel: Project → Settings → Environment Variables.
// Never put these in the React app or in .env files that start with VITE_.

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

export const config = {
  // PayMongo secret key. Use the TEST key (sk_test_...) for the capstone.
  get paymongoSecretKey() {
    return required('PAYMONGO_SECRET_KEY')
  },
  // Secret shown when you create the webhook in the PayMongo dashboard.
  get paymongoWebhookSecret() {
    return required('PAYMONGO_WEBHOOK_SECRET')
  },
  // Only changed by the automated tests (they use a fake PayMongo server).
  get paymongoApiBase() {
    return process.env.PAYMONGO_API_BASE || 'https://api.paymongo.com'
  },
  // Firebase service account JSON (the whole file contents, as one value).
  get firebaseServiceAccount() {
    return required('FIREBASE_SERVICE_ACCOUNT')
  },
  // Where the app lives, e.g. https://mtpb-violators.vercel.app
  // PayMongo sends people back here after paying.
  get appUrl() {
    return required('APP_URL').replace(/\/+$/, '')
  },
  // The app's Gmail, for receipt emails (server/mailer.js). Optional: without
  // them no email is sent. The app password is 16 letters; Google shows it
  // with spaces, which are dropped here.
  get gmailUser() {
    return (process.env.GMAIL_USER || '').trim()
  },
  get gmailAppPassword() {
    return (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')
  },
  // Other sites allowed to call this API, comma-separated.
  // Add http://localhost:5173 to test the app on your computer against the
  // deployed API.
  get allowedOrigins() {
    return (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  },
}
