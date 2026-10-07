import { useAuth } from '../auth/auth-context'
import PageHeader from '../components/PageHeader'
import QuickAccessItem from '../components/QuickAccessItem'
import VehicleCard, { VehicleCardPlaceholder } from '../components/VehicleCard'
import { CarIcon, FaqIcon, NotebookIcon, WalletIcon } from '../components/icons'
import useMyViolations from '../hooks/useMyViolations'
import useVehicles from '../hooks/useVehicles'

// Figma "DASHBOARD" (546:619): greeting, first registered vehicle,
// Quick Access list.
//
// The amount due deliberately isn't here — it lives on History, and showing
// the same figure twice makes neither one feel authoritative. What this page
// carries instead is the count of unpaid violations, on the row that leads
// to them.
function greetingFor(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning,'
  if (hour < 18) return 'Good afternoon,'
  return 'Good evening,'
}

// Icon boxes keep each glyph's Figma proportions (about 32px tall).
const QUICK_ACCESS = [
  {
    to: '/vehicles',
    title: 'My Vehicles',
    description: 'Manage your vehicles',
    tone: 'blue',
    icon: <CarIcon width={34} height={32} />,
  },
  {
    to: '/violations',
    title: 'Violations',
    description: 'View your violations',
    tone: 'amber',
    icon: <NotebookIcon width={32} height={32} />,
    key: 'violations',
  },
  {
    to: '/payments',
    title: 'Payments',
    description: 'View your payments',
    tone: 'green',
    icon: <WalletIcon width={34} height={30} />,
  },
  {
    to: '/faq',
    title: 'FAQs',
    description: 'Find answers to common questions.',
    tone: 'violet',
    icon: <FaqIcon width={32} height={32} />,
  },
]

export default function Home() {
  const { profile, user } = useAuth()
  const name = profile?.full_name || user?.displayName || 'Vehicle Owner'
  const { status, vehicles } = useVehicles(user?.uid)
  const { status: violationsStatus, violations } = useMyViolations(user?.uid)
  const primaryVehicle = vehicles[0]

  const unpaid = violationsStatus === 'ready' ? violations.filter((v) => v.paymentStatus !== 'paid') : []

  return (
    <div className="page">
      <PageHeader greeting={greetingFor()} name={name} />

      <main className="page__body home-body">
        {status === 'ready' && primaryVehicle ? (
          <VehicleCard vehicle={primaryVehicle} />
        ) : (
          <VehicleCardPlaceholder state={status === 'ready' ? 'empty' : status} />
        )}

        <h2 className="section-title">Quick Access</h2>
        <ul className="quick-access-list">
          {QUICK_ACCESS.map((item) => (
            <li key={item.to}>
              <QuickAccessItem
                {...item}
                // The only badge on this screen, so it goes where action is
                // needed rather than on every row.
                badge={item.key === 'violations' && unpaid.length > 0 ? unpaid.length : null}
              />
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
