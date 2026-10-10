import { Link } from 'react-router-dom'
import { useT } from '../i18n/language-context'
import { Skeleton } from './Skeleton'

// Loading / not found / error cards shared by the violation and payment pages.
export default function ViolationStates({ status, cin }) {
  const t = useT()
  if (status === 'loading') {
    // Shaped like the violation card that's about to replace it: the code,
    // then the row of details, then the Pay Now button.
    return (
      <div className="card state-card" role="status" aria-label={t('violation.loading')}>
        <Skeleton width="55%" height={20} />
        <Skeleton width="40%" height={12} style={{ marginTop: 10 }} />
        <div style={{ marginTop: 22 }}>
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} height={12} style={{ marginTop: i ? 16 : 0 }} />
          ))}
        </div>
        <Skeleton height={44} style={{ marginTop: 26, borderRadius: 10 }} />
      </div>
    )
  }
  if (status === 'not-found') {
    return (
      <div className="card state-card">
        <h2 className="screen-title">{t('violation.notFound.title')}</h2>
        <p>{t('violation.notFound.text', { cin })}</p>
        <Link className="text-link" to="/faq">
          {t('common.readFaqs')}
        </Link>
      </div>
    )
  }
  return (
    <div className="card state-card" role="alert">
      <h2 className="screen-title">{t('common.somethingWrong')}</h2>
      <p>{t('violation.error')}</p>
    </div>
  )
}
