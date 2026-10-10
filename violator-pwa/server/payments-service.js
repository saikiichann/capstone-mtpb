import { isPaymentSettled } from '../src/firebase/mapping.js'
import { computeChargesCentavos, METHOD_FEES } from '../src/payments/fees.js'
import { findPaidPayment, PAYMONGO_METHOD } from './paymongo.js'
import { buildReceiptEmail } from './receipt-email.js'

// Payment logic, kept separate from Firebase and HTTP so it can be tested
// with fakes. `store` is the Firestore adapter (server/firestore-store.js),
// `paymongo` is the PayMongo client (server/paymongo.js).
//
// Each Pay Now press is a checkout attempt. Only an attempt PayMongo has
// confirmed becomes a payment in the admin app, with a REF number.

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

const PH_MOBILE = /^(09|\+639)\d{9}$/

// At most this many Pay Now presses per person (account or guest) in the
// window (checklist S4). Counted from the checkout attempts already stored,
// so it holds across Vercel instances. Someone who cancels and retries a
// couple of times stays well under it.
export const MAX_RECENT_ATTEMPTS = 5
export const ATTEMPT_WINDOW_MS = 10 * 60 * 1000

// The admin app's own word, when there is one: our mapping folds
// "Pending Verification" into unpaid for display.
const isSettled = (violation) => isPaymentSettled(violation.raw?.paymentStatus ?? violation.paymentStatus)

// Firestore hands dates back as Timestamps, which don't survive JSON.
function toIso(value) {
  if (!value) return null
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

// What the success and receipt pages need to show, without giving them the
// attempt's contact details or PayMongo ids.
function publicView(attempt) {
  return {
    attemptId: attempt.id,
    referenceNumber: attempt.referenceNumber ?? null,
    violationId: attempt.violationId,
    cin: attempt.cin,
    plateNo: attempt.plateNo,
    violationType: attempt.violationType,
    location: attempt.location,
    officerName: attempt.officerName,
    method: attempt.method,
    fineAmount: attempt.fineAmount,
    convenienceFee: attempt.convenienceFee,
    totalAmount: attempt.totalAmount,
    paidAt: toIso(attempt.paidAt),
    createdAt: toIso(attempt.createdAt),
  }
}

// `mailer` (server/mailer.js) is optional: without it no receipt is emailed.
export function createPaymentService({ store, paymongo, mailer = null, now = () => new Date() }) {
  // Step 3 "Confirm Payment": records the attempt and starts a PayMongo
  // checkout. The amount always comes from the violation in Firestore, never
  // from the browser.
  async function startCheckout({ uid, violationId, cin, method, mobileNumber, email, returnOrigin }) {
    if (!METHOD_FEES[method]) throw new HttpError(400, 'Unknown payment method.')
    const mobile = String(mobileNumber ?? '').replace(/[\s-]/g, '')
    if (!PH_MOBILE.test(mobile)) throw new HttpError(400, 'Enter a valid mobile number.')
    const cleanEmail = String(email ?? '').trim()
    if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new HttpError(400, 'Enter a valid email.')

    const since = new Date(now().getTime() - ATTEMPT_WINDOW_MS)
    if ((await store.countRecentAttempts(uid, since)) >= MAX_RECENT_ATTEMPTS) {
      throw new HttpError(429, 'Too many payment attempts. Please wait a few minutes and try again.')
    }

    // A clamp's QR id stays with the clamp and is reused for its next
    // violation, so the id of the record itself is what we trust; the code
    // is only a fallback for older links.
    const violation =
      (violationId ? await store.getViolationById(String(violationId)) : null) ??
      (cin ? await store.getViolationByCin(String(cin)) : null)
    if (!violation) throw new HttpError(404, 'Violation not found.')
    if (isSettled(violation)) {
      throw new HttpError(409, 'This violation is already paid.', { referenceNumber: violation.referenceNumber })
    }

    const charges = computeChargesCentavos(violation.fineAmount, method)
    const profile = await store.getViolatorProfile(uid)

    const attemptId = await store.createAttempt({
      uid,
      violationId: violation.id,
      cin: violation.cin,
      plateNo: violation.plateNumber ?? '',
      violationType: violation.violationType ?? '',
      location: violation.location ?? '',
      officerName: violation.officerName ?? '',
      method,
      mobileNumber: mobile,
      email: cleanEmail,
      fineAmount: charges.fine / 100,
      convenienceFee: charges.fee / 100,
      totalAmount: charges.total / 100,
      status: 'pending',
      createdAt: now(),
    })

    const lineItems = [
      { name: `Fine – ${violation.cin}`, amount: charges.fine, currency: 'PHP', quantity: 1 },
    ]
    if (charges.fee > 0) {
      lineItems.push({ name: 'Convenience fee', amount: charges.fee, currency: 'PHP', quantity: 1 })
    }

    const billing = { phone: mobile }
    if (cleanEmail) billing.email = cleanEmail
    if (profile?.full_name) billing.name = profile.full_name

    let session
    try {
      session = await paymongo.createCheckoutSession({
        line_items: lineItems,
        payment_method_types: [PAYMONGO_METHOD[method]],
        description: `MTPB violation ${violation.cin}`,
        // The REF number doesn't exist yet, so PayMongo's dashboard shows the
        // attempt id. The admin app's payment record carries both.
        reference_number: attemptId,
        billing,
        // PayMongo emails its own receipt when we know the address, which
        // matters for guests: they have no account to come back to.
        send_email_receipt: Boolean(cleanEmail),
        show_description: true,
        show_line_items: true,
        success_url: `${returnOrigin}/payments/${encodeURIComponent(attemptId)}/success`,
        cancel_url: `${returnOrigin}/v/${encodeURIComponent(violation.cin)}/pay`,
        metadata: { attempt_id: attemptId, uid, cin: violation.cin },
      })
    } catch (err) {
      await store.updateAttempt(attemptId, { status: 'failed', failureReason: 'checkout_not_created' })
      throw new HttpError(502, 'The payment page couldn’t be opened. Please try again.', { cause: err.message })
    }

    await store.updateAttempt(attemptId, {
      checkoutSessionId: session.id,
      checkoutUrl: session.attributes.checkout_url,
      livemode: Boolean(session.attributes.livemode),
    })

    return { attemptId, checkoutUrl: session.attributes.checkout_url }
  }

  // Records the payment once PayMongo says so. Safe to call many times
  // (webhook retries, the success page asking again).
  async function settleFromSession(attemptId, session) {
    const paid = findPaidPayment(session)
    if (!paid) {
      if (session?.attributes?.status === 'expired') {
        await store.updateAttempt(attemptId, { status: 'expired' }, { onlyIfStatus: 'pending' })
        return 'expired'
      }
      return 'pending'
    }

    const attempt = await store.getAttempt(attemptId)
    if (!attempt) return 'unknown'
    const paidCentavos = paid.attributes.amount
    const expectedCentavos = Math.round(attempt.totalAmount * 100)
    if (paidCentavos !== expectedCentavos) {
      await store.updateAttempt(attemptId, { status: 'review', failureReason: 'amount_mismatch', paidCentavos })
      return 'review'
    }

    const result = await store.completePayment(attemptId, {
      paidAt: paid.attributes.paid_at ? new Date(paid.attributes.paid_at * 1000) : now(),
      paymongoPaymentId: paid.id,
      paymongoFee: (paid.attributes.fee ?? 0) / 100,
      paymongoNetAmount: (paid.attributes.net_amount ?? 0) / 100,
      paymongoSource: paid.attributes.source?.type ?? null,
      livemode: Boolean(paid.attributes.livemode ?? session.attributes.livemode),
    })
    // Only the call that recorded the payment sends the receipt, so webhook
    // retries and the success page asking again don't send it twice.
    if (result === 'paid') await emailReceipt(attemptId)
    return result
  }

  // Never fails the payment: a mail problem is noted on the attempt (our own
  // collection, not the admin app's payments) and the payment stands.
  async function emailReceipt(attemptId) {
    if (!mailer) return
    const attempt = await store.getAttempt(attemptId)
    if (!attempt?.email || attempt.receiptEmailSentAt) return
    try {
      await mailer.send({ to: attempt.email, ...buildReceiptEmail(attempt) })
      await store.updateAttempt(attemptId, { receiptEmailSentAt: now() })
    } catch (err) {
      console.error('Receipt email failed', err?.message ?? err)
      await store
        .updateAttempt(attemptId, { receiptEmailError: String(err?.message ?? err).slice(0, 300) })
        .catch(() => {})
    }
  }

  // The success page asks for this when it opens, so payments still get
  // recorded if the webhook is slow or can't reach the app (local testing).
  // The attempt lives where the browser can't read it, so this is also how
  // the page learns the REF number and what to show.
  async function confirm({ uid, attemptId }) {
    const id = String(attemptId ?? '')
    let attempt = await store.getAttempt(id)
    if (!attempt || attempt.uid !== uid) throw new HttpError(404, 'Payment not found.')

    let status = attempt.status
    if (status === 'pending' && attempt.checkoutSessionId) {
      const session = await paymongo.retrieveCheckoutSession(attempt.checkoutSessionId)
      status = await settleFromSession(id, session)
      if (status === 'already-paid') status = 'paid'
      attempt = (await store.getAttempt(id)) ?? attempt
    }
    return { status, payment: publicView(attempt) }
  }

  // Webhook: "checkout_session.payment.paid". The session is fetched again
  // from PayMongo instead of trusting the delivered body.
  async function handleWebhookEvent(event) {
    const type = event?.data?.attributes?.type
    if (type !== 'checkout_session.payment.paid') return { handled: false, type }
    const delivered = event.data.attributes.data
    const sessionId = delivered?.id
    if (!sessionId) return { handled: false, type }
    const session = await paymongo.retrieveCheckoutSession(sessionId)
    const attemptId = session.attributes.metadata?.attempt_id
    if (!attemptId) return { handled: false, type }
    return { handled: true, status: await settleFromSession(attemptId, session) }
  }

  return { startCheckout, confirm, handleWebhookEvent }
}
