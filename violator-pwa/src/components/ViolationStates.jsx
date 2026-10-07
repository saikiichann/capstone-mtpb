import { Link } from 'react-router-dom'
import { Skeleton } from './Skeleton'

// Loading / not found / error cards shared by the violation and payment pages.
export default function ViolationStates({ status, cin }) {
  if (status === 'loading') {
    // Shaped like the violation card that's about to replace it: the code,
    // then the row of details, then the Pay Now button.
    return (
      <div className="card state-card" role="status" aria-label="Loading violation details">
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
        <h2 className="screen-title">No violation found</h2>
        <p>We couldn't find a violation for {cin}. Double-check the QR code on the clamp.</p>
        <Link className="text-link" to="/faq">
          Read the FAQs
        </Link>
      </div>
    )
  }
  return (
    <div className="card state-card" role="alert">
      <h2 className="screen-title">Something went wrong</h2>
      <p>We couldn't load this violation. Check your connection and try again.</p>
    </div>
  )
}
