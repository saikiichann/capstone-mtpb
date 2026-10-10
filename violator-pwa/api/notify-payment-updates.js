import { adminAuth, createFirestoreStore } from '../server/firestore-store.js'
import { errorResponse, json, requireCronSecret } from '../server/http.js'
import { createMailer } from '../server/mailer.js'
import { createStatusNotifier } from '../server/status-notifier.js'

// POST /api/notify-payment-updates
// Header: Authorization: Bearer <CRON_SECRET>
// Called every ~15 minutes by .github/workflows/violator-pwa-payment-updates.yml.
// Emails people whose GCash payment MTPB staff just verified or rejected
// (server/status-notifier.js).
// Returns: { checked, sent, skipped, failed }

// An account's email, if it is verified. Guests (anonymous) have none.
async function lookupEmail(uid) {
  try {
    const user = await adminAuth().getUser(uid)
    return user.emailVerified ? user.email : null
  } catch {
    return null
  }
}

export async function POST(request) {
  try {
    requireCronSecret(request)
    const notifier = createStatusNotifier({ store: createFirestoreStore(), mailer: createMailer(), lookupEmail })
    return json(200, await notifier.run())
  } catch (err) {
    return errorResponse(err, {})
  }
}
