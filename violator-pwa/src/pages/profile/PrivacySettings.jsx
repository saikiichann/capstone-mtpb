import PageHeader from '../../components/PageHeader'
import { SUPPORT_EMAIL } from '../../data/contact'

// Figma "PRIVACY". Only "What MTPB keeps": the Camera and File Upload
// permission rows went with the OR/CR upload, since the app no longer uses
// either (violators scan QR codes with their phone's own camera app).
// "How long we keep it" and "Your rights" (checklist N2) use general wording
// until MTPB confirms the exact retention period and its Data Protection
// Officer; add those here once they do.
//
// Updated 2026-10-14 for how payments now reach accounts (checklist P1,
// server/account-links.js): the email typed when paying decides the account,
// cash payments are added from the slip's QR, vehicles come from payments,
// and new unpaid violations on those plates show to every account that has
// the plate. Keep this page in step with CLAUDE.md "Payments follow the
// person into their account".
export default function PrivacySettings() {
  return (
    <div className="page">
      <PageHeader title="Privacy" back="/profile" />

      <main className="page__body settings-body">
        <h2 className="settings-group__title settings-group__title--lg">What MTPB keeps</h2>
        <div className="card privacy-card">
          <ul className="privacy-list">
            <li>Your name, email, mobile number and (if you add it) address.</li>
            <li>
              The payments made to your account, and the violations they paid. A payment reaches your account when
              your email is entered while paying with GCash, or when you add a cash payment by scanning the QR on
              its payment slip.
            </li>
            <li>
              The vehicles on your account. A plate is added when a payment on it reaches your account. It groups
              your violations and payments by vehicle.
            </li>
            <li>
              New unpaid violations recorded on those plates after they joined your account, so you can pay them
              in the app.
            </li>
            <li>
              For a GCash payment: the mobile number and email entered for it. For a cash payment you added: a
              record that you added it, so we can tell you when the vehicle is released.
            </li>
            <li>
              If the app crashes: a technical error report, with email addresses, mobile numbers and QR codes
              removed.
            </li>
            <li>
              Payments are processed by MTPB's payment provider. The app never sees your GCash password, and
              card or wallet credentials are never stored here.
            </li>
          </ul>
          <p className="privacy-card__note">
            Paying as a guest? The email is optional. Without it, nothing is kept in an account: download your
            receipt after paying.
          </p>
          <p className="privacy-card__note">
            To correct or remove your details, contact the MTPB office through Help &amp; Support.
          </p>
        </div>

        <h2 className="settings-group__title settings-group__title--lg">Why we collect it</h2>
        <div className="card privacy-card">
          <ul className="privacy-list">
            <li>To show you the violations on your vehicles, and to let you pay new ones in the app.</li>
            <li>To process your payments and give you a receipt.</li>
            <li>So MTPB can verify your payment and release your vehicle.</li>
            <li>
              To email you the receipt, whether MTPB verified or didn’t accept your payment, and when your
              vehicle is released. These go only to the email entered when paying, or to your account’s email.
              Cash payments get only the release email, once added to your account.
            </li>
            <li>To find and fix problems in the app.</li>
          </ul>
        </div>

        <h2 className="settings-group__title settings-group__title--lg">Who can see it</h2>
        <div className="card privacy-card">
          <ul className="privacy-list">
            <li>MTPB personnel handling your violation, its payment and the release of your vehicle.</li>
            <li>
              The account with the email entered when paying. If someone pays for your vehicle and enters your
              email, the payment shows in your account, not theirs. If you pay for someone else and enter their
              email, it goes to their account, not yours.
            </li>
            <li>
              Anyone who has a plate on their account from an earlier payment sees new <strong>unpaid</strong>{' '}
              violations on that plate, so they can pay them. Once paid, a violation shows only to the account it
              was paid to.
            </li>
            <li>
              Anyone holding a cash payment slip can scan its QR to check the payment: reference number, amount,
              date, status, violation number and plate. No names or contact details. Once MTPB verifies it, the
              first account to add it within 7 days keeps it.
            </li>
            <li>
              MTPB's payment provider, only for a GCash payment: the amount, and the mobile number and email
              you enter for it.
            </li>
            <li>The email service that sends MTPB’s emails, and the error-reporting service that receives crash reports.</li>
          </ul>
        </div>

        <h2 className="settings-group__title settings-group__title--lg">How long we keep it</h2>
        <div className="card privacy-card">
          <ul className="privacy-list">
            <li>
              Violations and payments are government records. MTPB keeps them for as long as the law and
              government record-keeping rules require, then disposes of them securely.
            </li>
            <li>Your account details are kept while you have an account.</li>
            <li>Crash reports are kept by the error-reporting service for a limited time, then deleted.</li>
          </ul>
        </div>

        <h2 className="settings-group__title settings-group__title--lg">Your rights</h2>
        <div className="card privacy-card">
          <p className="privacy-card__note">Under the Data Privacy Act, you can:</p>
          <ul className="privacy-list">
            <li>Ask what personal information MTPB has about you, and get a copy.</li>
            <li>Have wrong or incomplete details corrected.</li>
            <li>
              Ask for your account to be deleted. Violation and payment records that the law requires MTPB
              to keep stay on record.
            </li>
            <li>Object to how your information is used.</li>
            <li>File a complaint with the National Privacy Commission (privacy.gov.ph).</li>
          </ul>
          <p className="privacy-card__note">
            For any of these, email the MTPB office at{' '}
            <a className="text-link" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>{' '}
            or visit the office through Help &amp; Support.
          </p>
        </div>

        <div className="card privacy-card">
          <p className="privacy-card__note">
            MTPB collects and processes your personal information in accordance with the Data Privacy Act of
            2012 (Republic Act No. 10173), and only for the purposes above.
          </p>
        </div>
      </main>
    </div>
  )
}
