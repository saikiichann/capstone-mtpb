// Payment method fees, shared by the app (to show the breakdown) and the
// Vercel backend (to charge it). Plain JS with no imports so both can use it.
//
// Rates are PayMongo's published merchant discount rates (MDR), which exclude
// 12% VAT: https://www.paymongo.com/en-ph/pricing
// Check that page again before the defense and update these if they changed.
//
// PASS_FEES_TO_PAYER = true adds the fee on top of the fine, so MTPB still
// receives the full fine. PayMongo's pass-on-fee formula is used:
//   total = (fine + fixed fee) / (1 - MDR)
// Set it to false if MTPB decides to absorb the fee instead (the violator
// then pays only the fine).

export const PASS_FEES_TO_PAYER = true
export const VAT_RATE = 0.12

export const METHOD_FEES = {
  gcash: { label: 'GCash', mdr: 0.0223, fixed: 0 },}

const toCentavos = (pesos) => Math.round(Number(pesos) * 100)

// Returns amounts in centavos: { fine, fee, total }.
export function computeChargesCentavos(fineAmount, methodId, passOn = PASS_FEES_TO_PAYER) {
  const fine = toCentavos(fineAmount)
  if (!Number.isFinite(fine) || fine <= 0) throw new Error('Invalid fine amount')
  const rates = METHOD_FEES[methodId]
  if (!rates) throw new Error(`Unknown payment method: ${methodId}`)
  if (!passOn) return { fine, fee: 0, total: fine }

  const mdr = rates.mdr * (1 + VAT_RATE)
  const fixed = rates.fixed * 100 * (1 + VAT_RATE)
  // Round up so the fee never falls short by a centavo.
  const total = Math.ceil((fine + fixed) / (1 - mdr) - 1e-9)
  return { fine, fee: total - fine, total }
}

// Same result in pesos, for display: { fine, fee, total }.
export function computeCharges(fineAmount, methodId, passOn = PASS_FEES_TO_PAYER) {
  const c = computeChargesCentavos(fineAmount, methodId, passOn)
  return { fine: c.fine / 100, fee: c.fee / 100, total: c.total / 100 }
}
