import { Navigate, useSearchParams } from 'react-router-dom'
import LanguageToggle from '../components/LanguageToggle'
import PageHeader from '../components/PageHeader'
import { useT } from '../i18n/language-context'

// The admin app's QR Management prints stickers as `/scan?t=<token>`: a
// random token stored on the clamp as `scanToken`, which IT can re-issue if
// a sticker is lost or copied. The clamp number is deliberately never in the
// link, so only the token is accepted — typing a clamp number finds nothing.
export default function ScanRedirect() {
  const [searchParams] = useSearchParams()
  const t = useT()
  const token = searchParams.get('t')?.trim()

  if (token) return <Navigate to={`/q/${encodeURIComponent(token)}`} replace />

  return (
    <div className="page">
      <PageHeader title={t('scan.title')} back="/" action={<LanguageToggle />} />
      <main className="page__body">
        <section className="card state-card">
          <h2 className="screen-title">{t('scan.noCode.title')}</h2>
          <p>{t('scan.noCode.text')}</p>
        </section>
      </main>
    </div>
  )
}
