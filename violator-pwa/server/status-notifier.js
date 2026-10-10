import { buildStatusEmail } from './status-email.js'

// Emails people when MTPB staff verify or reject a GCash payment they made in
// the app (checklist P2). Run every ~15 minutes by a scheduled GitHub check
// (.github/workflows/violator-pwa-payment-updates.yml) calling
// /api/notify-payment-updates.
//
// Mira's Payment Verification sets `verificationStatus` ("Verified" /
// "Rejected"), `verifiedAt` and, when rejecting, `rejectionReason` on the
// payment. Nothing is written to her records: "already emailed" is kept on our
// own checkout attempt (`statusEmailFor`). Cash payments recorded at the
// office have no attempt and are skipped.

// How far back each run looks: far longer than the 15-minute schedule, so a
// late or skipped GitHub run loses nothing (the attempt remembers what was
// sent), but short enough that switching this on doesn't email people about
// payments decided days ago.
export const LOOKBACK_MS = 6 * 60 * 60 * 1000
// Keeps one run well inside Vercel's time limit.
export const MAX_EMAILS_PER_RUN = 20

const DECISIONS = ['Verified', 'Rejected']

// `lookupEmail(uid)` gives an account's verified email, for people who
// didn't type one when paying (guests have none).
export function createStatusNotifier({ store, mailer, lookupEmail = async () => null, now = () => new Date() }) {
  async function run() {
    const summary = { checked: 0, sent: 0, skipped: 0, failed: 0 }
    if (!mailer) return { ...summary, disabled: true }

    const since = new Date(now().getTime() - LOOKBACK_MS)
    const payments = await store.listDecidedAppPayments(since)

    for (const payment of payments) {
      const decision = payment.verificationStatus
      if (!DECISIONS.includes(decision) || !payment.checkoutAttemptId) continue
      summary.checked += 1
      if (summary.sent + summary.failed >= MAX_EMAILS_PER_RUN) break

      const attempt = await store.getAttempt(payment.checkoutAttemptId)
      if (!attempt || attempt.statusEmailFor === decision) continue

      const to = attempt.email || (await lookupEmail(attempt.uid))
      if (!to) {
        // Nobody to tell; remember it so later runs don't look again.
        await store.updateAttempt(attempt.id, { statusEmailFor: decision, statusEmailSkipped: 'no email' })
        summary.skipped += 1
        continue
      }

      try {
        await mailer.send({ to, ...buildStatusEmail({ decision, attempt, payment }) })
        await store.updateAttempt(attempt.id, { statusEmailFor: decision, statusEmailSentAt: now() })
        summary.sent += 1
      } catch (err) {
        // Not marked as sent, so the next run tries again.
        console.error('Status email failed', err?.message ?? err)
        await store
          .updateAttempt(attempt.id, { statusEmailError: String(err?.message ?? err).slice(0, 300) })
          .catch(() => {})
        summary.failed += 1
      }
    }
    return summary
  }

  return { run }
}
