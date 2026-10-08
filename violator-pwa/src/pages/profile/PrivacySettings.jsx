import PageHeader from '../../components/PageHeader'

// Figma "PRIVACY". Only "What MTPB keeps": the Camera and File Upload
// permission rows went with the OR/CR upload, since the app no longer uses
// either (violators scan QR codes with their phone's own camera app).
export default function PrivacySettings() {
  return (
    <div className="page">
      <PageHeader title="Privacy" back="/profile" />

      <main className="page__body settings-body">
        <h2 className="settings-group__title settings-group__title--lg">What MTPB keeps</h2>
        <div className="card privacy-card">
          <ul className="privacy-list">
            <li>Your name, email, mobile number and (if you add it) address.</li>
            <li>Your registered vehicles, added by MTPB when a violation is recorded against their plates.</li>
            <li>Violations recorded against your plates, and the payments you make for them.</li>
            <li>
              Payments are processed by PayMongo. The app never sees your GCash password, and card or
              wallet credentials are never stored here.
            </li>
          </ul>
          <p className="privacy-card__note">
            To correct or remove your details, contact the MTPB office through Help &amp; Support.
          </p>
        </div>

        <h2 className="settings-group__title settings-group__title--lg">Why we collect it</h2>
        <div className="card privacy-card">
          <ul className="privacy-list">
            <li>To show you the violations recorded against your vehicles.</li>
            <li>To process your payments and give you a receipt.</li>
            <li>So MTPB can verify your payment and release your vehicle.</li>
          </ul>
        </div>

        <h2 className="settings-group__title settings-group__title--lg">Who can see it</h2>
        <div className="card privacy-card">
          <ul className="privacy-list">
            <li>MTPB personnel handling your violation, its payment and the release of your vehicle.</li>
            <li>
              PayMongo, only for a GCash payment: the amount, and the mobile number and email you enter
              for it.
            </li>
          </ul>
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
