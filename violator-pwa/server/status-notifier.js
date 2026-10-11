import { buildReleaseEmail, buildStatusEmail } from './status-email.js'

// Emails people when MTPB staff verify or reject a GCash payment they made in
// the app (checklist P2). cron-job.org calls /api/notify-payment-updates every
// 5 minutes; the scheduled GitHub check
// (.github/workflows/violator-pwa-payment-updates.yml) calls it too, as a backup.
// GitHub's schedule turned out to run only every few hours. Calling it twice is
// harmless: each attempt remembers what was already sent.
//
// Mira's Payment Verification sets `verificationStatus` ("Verified" /
// "Rejected"), `verifiedAt` and, when rejecting, `rejectionReason` on the
// payment. Nothing is written to her records: "already emailed" is kept on our
// own checkout attempt (`statusEmailFor`). Cash payments recorded at the
// office have no attempt and are skipped.

// How far back each run looks: a full day, so even hours without a run lose
// nothing (the attempt remembers what was sent).
export const LOOKBACK_MS = 24 * 60 * 60 * 1000
// Keeps one run well inside Vercel's time limit.
export const MAX_EMAILS_PER_RUN = 20

const DECISIONS = ['Verified', 'Rejected']

// `lookupEmail(uid)` gives an account's verified email, for people who
// didn't type one when paying (guests have none).
// Second pass: "Your vehicle has been released". Mira's release step
// (admin-web/src/lib/Release.ts) sets releaseStatus "Released",
// releaseOrderId, releasedAt and releasedBy on the violation; whoever paid
// for it in the app is emailed once (`releaseEmailFor` on their attempt).
// Cash payers have no attempt and are skipped, as above.
//
// `lookupEmail(uid)` gives an account's verified email, for people who
// didn't type one when paying (guests have none).
export function createStatusNotifier({ store, mailer, lookupEmail = async () => null, now = () => new Date() }) {
  // Sends one email for one attempt and remembers it under `prefix`
  // ("statusEmail" or "releaseEmail"): <prefix>For, <prefix>SentAt,
  // <prefix>Skipped, <prefix>Error.
  async function deliver(attempt, { prefix, value, build }, counts, total) {
    if (attempt[`${prefix}For`] === value) return
    counts.checked += 1
    if (total.sent + total.failed >= MAX_EMAILS_PER_RUN) return

    const to = attempt.email || (await lookupEmail(attempt.uid))
    if (!to) {
      // Nobody to tell; remember it so later runs don't look again.
      await store.updateAttempt(attempt.id, { [`${prefix}For`]: value, [`${prefix}Skipped`]: 'no email' })
      counts.skipped += 1
      return
    }
    try {
      await mailer.send({ to, ...build() })
      await store.updateAttempt(attempt.id, { [`${prefix}For`]: value, [`${prefix}SentAt`]: now() })
      counts.sent += 1
      total.sent += 1
    } catch (err) {
      // Not marked as sent, so the next run tries again.
      console.error(`${prefix} failed`, err?.message ?? err)
      await store
        .updateAttempt(attempt.id, { [`${prefix}Error`]: String(err?.message ?? err).slice(0, 300) })
        .catch(() => {})
      counts.failed += 1
      total.failed += 1
    }
  }

  async function run() {
    const summary = { checked: 0, sent: 0, skipped: 0, failed: 0 }
    const released = { checked: 0, sent: 0, skipped: 0, failed: 0 }
    if (!mailer) return { ...summary, released, disabled: true }
    const total = { sent: 0, failed: 0 }
    const since = new Date(now().getTime() - LOOKBACK_MS)

    // Verified / rejected payments.
    for (const payment of await store.listDecidedAppPayments(since)) {
      const decision = payment.verificationStatus
      if (!DECISIONS.includes(decision) || !payment.checkoutAttemptId) continue
      const attempt = await store.getAttempt(payment.checkoutAttemptId)
      if (!attempt) continue
      if (attempt.statusEmailFor === decision) {
        summary.checked += 1
        continue
      }
      await deliver(attempt, { prefix: 'statusEmail', value: decision, build: () => buildStatusEmail({ decision, attempt, payment }) }, summary, total)
    }

    // Released vehicles.
    for (const violation of await store.listReleasedViolations(since)) {
      for (const attempt of await store.listPaidAttemptsFor(violation.id)) {
        if (attempt.releaseEmailFor === 'Released') {
          released.checked += 1
          continue
        }
        await deliver(attempt, { prefix: 'releaseEmail', value: 'Released', build: () => buildReleaseEmail({ attempt, violation }) }, released, total)
      }
    }

    return { ...summary, released }
  }

  return { run }
}
