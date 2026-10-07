import { Navigate, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'

// The admin app's QR Management prints stickers as `/scan?t=<token>`: a
// random token stored on the clamp as `scanToken`, which IT can re-issue if
// a sticker is lost or copied. The clamp number is deliberately never in the
// link, so only the token is accepted — typing a clamp number finds nothing.
export default function ScanRedirect() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('t')?.trim()

  if (token) return <Navigate to={`/q/${encodeURIComponent(token)}`} replace />

  return (
    <div className="page">
      <PageHeader title="Scanned Clamp" back="/" />
      <main className="page__body">
        <section className="card state-card">
          <h2 className="screen-title">No clamp code in that link</h2>
          <p>
            The QR code didn’t include a clamp number. Please check the sticker on the clamp, or visit the
            MTPB office with your plate number and they’ll look up the violation for you.
          </p>
        </section>
      </main>
    </div>
  )
}
