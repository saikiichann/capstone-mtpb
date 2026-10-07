import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'

export default function NotFound() {
  return (
    <div className="page">
      <PageHeader title="Page not found" />
      <main className="page__body">
        <div className="card state-card">
          <p>Check the link, or scan the QR code on your clamp notice again.</p>
          <Link className="text-link" to="/faq">
            Read the FAQs
          </Link>
        </div>
      </main>
    </div>
  )
}
