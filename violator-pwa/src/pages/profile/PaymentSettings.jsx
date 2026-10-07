import { useState } from 'react'
import gcashLogo from '../../assets/pay-gcash.webp'
import { useAuth } from '../../auth/auth-context'
import CompactField from '../../components/CompactField'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import SettingsRow from '../../components/SettingsRow'
import { CardIcon } from '../../components/icons/rows'

// Figma "PAYMENT SETTINGS". The app never holds a GCash account — every
// payment goes through PayMongo's own page — so these are just saved mobile
// numbers that fill in the payment form for you.
const PROVIDERS = {
  gcash: { label: 'GCash', logo: gcashLogo },
}
const PH_MOBILE = /^(09|\+639)\d{9}$/
const MAX_WALLETS = 4

export default function PaymentSettings() {
  const { profile, updateProfile } = useAuth()
  // Maya was removed; any Maya number saved before is dropped on the next save.
  const wallets = (profile?.wallets ?? []).filter((w) => PROVIDERS[w.provider])
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(next) {
    setBusy(true)
    setError('')
    try {
      await updateProfile({ wallets: next })
      setAdding(false)
    } catch (err) {
      console.error('Could not save wallets', err)
      setError('We couldn’t save that. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  function addWallet(wallet) {
    const next = [...wallets.filter((w) => w.id !== wallet.id), wallet]
    // The first one saved for a provider becomes its default.
    const hasDefault = wallets.some((w) => w.provider === wallet.provider && w.isDefault)
    return save(next.map((w) => (w.id === wallet.id ? { ...w, isDefault: !hasDefault } : w)))
  }

  function makeDefault(wallet) {
    return save(
      wallets.map((w) =>
        w.provider === wallet.provider ? { ...w, isDefault: w.id === wallet.id } : w,
      ),
    )
  }

  function removeWallet(wallet) {
    const next = wallets.filter((w) => w.id !== wallet.id)
    // Keep a default for the provider if one is left.
    const sameProvider = next.filter((w) => w.provider === wallet.provider)
    if (sameProvider.length && !sameProvider.some((w) => w.isDefault)) {
      sameProvider[0].isDefault = true
    }
    return save(next)
  }

  return (
    <div className="page">
      <PageHeader title="Payment Settings" back="/profile" />

      <main className="page__body settings-body">
        <h2 className="settings-group__title settings-group__title--lg">My Wallets</h2>
        <p className="settings-hint">
          Saved numbers fill in the payment form for you. You still confirm every payment in the GCash app, so
          nothing is charged without you.
        </p>

        {wallets.length === 0 && (
          <p className="empty-text empty-text--tight">No saved numbers yet.</p>
        )}

        <ul className="wallet-list">
          {wallets.map((wallet) => (
            <li key={wallet.id}>
              <WalletCard
                wallet={wallet}
                busy={busy}
                onMakeDefault={() => makeDefault(wallet)}
                onRemove={() => removeWallet(wallet)}
              />
            </li>
          ))}
        </ul>

        {error && (
          <p className="form-message form-message--error" role="alert">
            {error}
          </p>
        )}

        {wallets.length < MAX_WALLETS && (
          <button type="button" className="btn btn--pay btn--outline add-wallet-btn" onClick={() => setAdding(true)}>
            + Add Wallet
          </button>
        )}

        <div className="card settings-group__list settings-group__list--single">
          <SettingsRow
            icon={<CardIcon />}
            title="Payment History"
            description="View your payment receipts and transaction history"
            to="/payments"
            last
          />
        </div>

        <AddWalletDialog
          open={adding}
          busy={busy}
          existing={wallets}
          onClose={() => setAdding(false)}
          onAdd={addWallet}
        />
      </main>
    </div>
  )
}

function WalletCard({ wallet, busy, onMakeDefault, onRemove }) {
  const provider = PROVIDERS[wallet.provider]

  return (
    <article className={`card wallet-card${wallet.isDefault ? ' wallet-card--default' : ''}`}>
      <img className="wallet-card__logo" src={provider.logo} width={56} height={56} alt="" />
      <div className="wallet-card__text">
        <h3 className="wallet-card__name">{provider.label}</h3>
        <p className="wallet-card__number">{wallet.mobileNumber}</p>
        <StatusBadge status={wallet.isDefault ? 'default' : 'saved'} className="wallet-card__badge" />
      </div>
      <div className="wallet-card__actions">
        {!wallet.isDefault && (
          <button type="button" className="text-button" onClick={onMakeDefault} disabled={busy}>
            Set default
          </button>
        )}
        <button type="button" className="text-button wallet-card__remove" onClick={onRemove} disabled={busy}>
          Remove
        </button>
      </div>
    </article>
  )
}

function AddWalletDialog({ open, busy, existing, onClose, onAdd }) {
  const provider = 'gcash'
  const [mobileNumber, setMobileNumber] = useState('')
  const [error, setError] = useState('')

  function handleAdd() {
    const clean = mobileNumber.replace(/[\s-]/g, '')
    if (!PH_MOBILE.test(clean)) {
      setError('Use an 11-digit number like 09171234567.')
      return
    }
    if (existing.some((w) => w.provider === provider && w.mobileNumber === clean)) {
      setError('That number is already saved for this wallet.')
      return
    }
    setError('')
    onAdd({ id: `${provider}-${clean}`, provider, mobileNumber: clean, isDefault: false })
    setMobileNumber('')
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="add-wallet-title" className="confirm-modal">
      <h2 id="add-wallet-title" className="confirm-modal__title">
        Add GCash number
      </h2>

      <CompactField label="GCash Mobile Number" error={error}>
        {(props) => (
          <input
            {...props}
            type="tel"
            inputMode="tel"
            placeholder="09XX XXX XXXX"
            maxLength={15}
            value={mobileNumber}
            onChange={(e) => {
              setMobileNumber(e.target.value)
              setError('')
            }}
          />
        )}
      </CompactField>

      <div className="confirm-modal__actions">
        <button type="button" className="btn btn--pay btn--outline" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn--pay btn--primary" onClick={handleAdd} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
