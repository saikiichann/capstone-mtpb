import { config } from '../server/config.js'
import { createFirestoreStore } from '../server/firestore-store.js'
import { json } from '../server/http.js'
import { createMailer } from '../server/mailer.js'
import { paymongo, verifyWebhookSignature } from '../server/paymongo.js'
import { createPaymentService } from '../server/payments-service.js'

// POST /api/paymongo-webhook
// Register this URL in the PayMongo dashboard (Developers → Webhooks) with
// the event "checkout_session.payment.paid".

export async function POST(request) {
  // The signature is computed over the exact bytes PayMongo sent.
  const rawBody = await request.text()
  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const livemode = Boolean(event?.data?.attributes?.livemode)
  const valid = verifyWebhookSignature(
    rawBody,
    request.headers.get('paymongo-signature'),
    config.paymongoWebhookSecret,
    livemode,
  )
  if (!valid) return json(401, { error: 'Invalid signature' })

  try {
    const service = createPaymentService({ store: createFirestoreStore(), paymongo, mailer: createMailer() })
    const result = await service.handleWebhookEvent(event)
    return json(200, { received: true, ...result })
  } catch (err) {
    // A non-200 reply makes PayMongo retry later.
    console.error('Webhook handling failed', err)
    return json(500, { error: 'Temporary failure' })
  }
}
