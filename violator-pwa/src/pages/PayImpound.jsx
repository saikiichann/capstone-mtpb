import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi } from '../api'
import LanguageToggle from '../components/LanguageToggle'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import TextField from '../components/TextField'
import { ensureSignedIn } from '../firebase/auth'
import { shouldUseSampleData } from '../firebase/config'
import { rememberScanToken } from '../firebase/scan-tokens'
import { useT } from '../i18n/language-context'
import { formatDateTime, formatPeso } from '../utils/format'

// Opened from the static QR at the impound desk: /pay-impound (printed by
// the admin's IT Admin > QR Codes > Impound QR). The owner types the plate
// number and the last 4 of the OVR No. on their Blue Ticket; the plate alone
// isn't enough, since anyone can read a plate. The server
// (server/violation-access.js) answers with the unpaid impound and a
// 30-minute pass to it, kept like a clamp's scan token, so the usual
// violation, Pay Now and receipt pages take over from here.
export default function PayImpound() {
  const t = useT()
  const navigate = useNavigate()
  const [plate, setPlate] = useState('')
  const [ovrLast4, setOvrLast4] = useState('')
  const [state, setState] = useState({ status: 'form', error: '', found: null })

  async function handleSubmit(event) {
    event.preventDefault()
    const last4 = ovrLast4.trim()
    if (!plate.trim() || !/^[A-Za-z0-9]{4}$/.test(last4)) {
      setState({ status: 'form', error: t('payImpound.invalid'), found: null })
      return
    }
    setState({ status: 'searching', error: '', found: null })
    try {
      if (shouldUseSampleData) throw Object.assign(new Error('sample data'), { status: 404 })
      await ensureSignedIn()
      const found = await callApi('violations', { action: 'impound-lookup', plate: plate.trim(), ovrLast4: last4 })
      setState({ status: 'confirm', error: '', found })
    } catch (err) {
      const error =
        err?.status === 404 ? t('payImpound.notFound') : err?.status === 429 || err?.status === 400 ? err.message : t('payImpound.error')
      if (!err?.status || err.status >= 500) console.error('Impound lookup failed', err)
      setState({ status: 'form', error, found: null })
    }
  }

  function handleConfirm() {
    const { violation, token } = state.found
    rememberScanToken([violation.id, violation.cin], token)
    navigate(`/v/${encodeURIComponent(violation.id)}`)
  }

  function searchAgain() {
    setOvrLast4('')
    setState({ status: 'form', error: '', found: null })
  }

  const violation = state.found?.violation

  return (
    <div className="page">
      <PageHeader title={t('payImpound.title')} action={<LanguageToggle />} />
      <main className="page__body">
        {state.status !== 'confirm' && (
          <form className="card impound-form" onSubmit={handleSubmit} noValidate>
            <p>{t('payImpound.intro')}</p>
            <TextField
              label={t('payImpound.plate')}
              name="plate"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder={t('payImpound.platePlaceholder')}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
            />
            <TextField
              label={t('payImpound.ovr')}
              name="ovrLast4"
              autoComplete="off"
              inputMode="numeric"
              maxLength={4}
              placeholder={t('payImpound.ovrPlaceholder')}
              hint={t('payImpound.ovrHint')}
              value={ovrLast4}
              onChange={(e) => setOvrLast4(e.target.value)}
            />
            {state.error && (
              <p className="field__error" role="alert">
                {state.error}
              </p>
            )}
            <button type="submit" className="btn btn--primary" disabled={state.status === 'searching'}>
              {state.status === 'searching' ? t('payImpound.finding') : t('payImpound.find')}
            </button>
          </form>
        )}

        {state.status === 'confirm' && violation && (
          <section className="card impound-confirm" aria-labelledby="impound-confirm-title">
            <h2 id="impound-confirm-title" className="screen-title">
              {t('payImpound.confirm.title')}
            </h2>
            <dl className="detail-list">
              {[
                [t('payImpound.row.plate'), violation.plateNumber],
                [t('payImpound.row.type'), violation.vehicleType],
                [t('payImpound.row.color'), violation.vehicleColor],
                [t('payImpound.row.date'), formatDateTime(violation.clampedAt)],
                [t('payImpound.row.lot'), violation.impoundLocation],
                [t('payImpound.row.fee'), formatPeso(violation.amountDue)],
                [t('payImpound.row.total'), formatPeso(violation.amountDue), 'danger'],
              ].map(([label, value, tone]) => (
                <div className="detail-list__row" key={label}>
                  <dt>{label}</dt>
                  <dd className={tone === 'danger' ? 'detail-list__value--danger' : undefined}>{value || '—'}</dd>
                </div>
              ))}
              <div className="detail-list__row">
                <dt>{t('payImpound.row.status')}</dt>
                <dd>
                  <StatusBadge status={violation.paymentStatus} />
                </dd>
              </div>
            </dl>
            <p className="field__hint">{t('payImpound.feeNote')}</p>
            <p>{t('payImpound.release')}</p>
            <div className="btn-stack">
              <button type="button" className="btn btn--primary" onClick={handleConfirm}>
                {t('payImpound.confirm')}
              </button>
              <button type="button" className="btn btn--outline" onClick={searchAgain}>
                {t('payImpound.notMine')}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
