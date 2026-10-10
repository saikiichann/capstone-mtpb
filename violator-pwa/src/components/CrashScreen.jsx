import { useT } from '../i18n/language-context'
import PageHeader from './PageHeader'

// Shown by ErrorBoundary instead of a blank white page when a screen
// crashes. "Home" is a plain link so the whole app starts fresh.
export default function CrashScreen() {
  const t = useT()
  return (
    <div className="page">
      <PageHeader title={t('crash.header')} />
      <main className="page__body">
        <div className="card state-card" role="alert">
          <h2 className="screen-title">{t('common.somethingWrong')}</h2>
          <p>{t('crash.text')}</p>
          <div className="btn-stack">
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
              {t('crash.reload')}
            </button>
            <a className="btn btn--secondary" href="/">
              {t('crash.home')}
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
