import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'

// Temporary stand-in for screens that exist in Figma but aren't built yet,
// so navigation links don't dead-end while the app is in progress.
export default function ComingSoon({ title }) {
  return (
    <div className="page">
      <PageHeader title={title} />
      <main className="page__body">
        <div className="card state-card">
          <h2 className="screen-title">Not built yet</h2>
          <p>The {title} screen is designed in Figma and is next on the build list.</p>
          <Link className="text-link" to="/">
            Back to Home
          </Link>
        </div>
      </main>
    </div>
  )
}
