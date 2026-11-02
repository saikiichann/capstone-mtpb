import { clampStateOf, amountDueOf, graceLeftText, CLAMP_STATES } from '../src/utils/clampState';

const H = 3600000;
const now = Date.UTC(2026, 9, 29, 6, 0, 0);
const ts = (ms) => ({ toMillis: () => ms });

describe('clampStateOf — same states as QR Management', () => {
  test.each([
    ['unpaid within 24 h', { recordedAt: ts(now - 2 * H), paymentStatus: 'Unpaid', fineAmount: 900 }, 'unpaid', 900],
    ['overdue after 24 h', { recordedAt: ts(now - 30 * H), paymentStatus: 'Unpaid', fineAmount: 900 }, 'overdue', 2000],
    ['gracePeriodEnd wins over recordedAt', { recordedAt: ts(now - 30 * H), gracePeriodEnd: ts(now + H), paymentStatus: 'Unpaid', fineAmount: 900 }, 'unpaid', 900],
    ['exactly at 24 h is overdue', { recordedAt: ts(now - 24 * H), paymentStatus: 'Unpaid', fineAmount: 900 }, 'overdue', 2000],
    ['paid, waiting for verification', { recordedAt: ts(now - 30 * H), paymentStatus: 'Pending Verification', totalPaid: 2000 }, 'for-verification', 2000],
    ['verified', { paymentStatus: 'Verified', releaseStatus: 'Awaiting OIC Approval', totalPaid: 900 }, 'verified', 900],
    ['approved by OIC', { paymentStatus: 'Verified', releaseStatus: 'Approved by OIC', totalPaid: 900 }, 'ready-for-release', 900],
    ['released', { paymentStatus: 'Verified', releaseStatus: 'Released', releasedAt: ts(now), totalPaid: 900 }, 'released', 900],
    ['rejected payment is payable again', { recordedAt: ts(now - 2 * H), paymentStatus: 'Rejected', fineAmount: 900 }, 'unpaid', 900],
    ['cancelled', { releaseStatus: 'Cancelled' }, 'cancelled', 0],
  ])('%s', (_name, v, state, amount) => {
    const s = clampStateOf(v, now);
    expect(s).toBe(state);
    expect(amountDueOf(v, s)).toBe(amount);
  });

  test('unsettled states sort before settled ones', () => {
    const order = ['overdue', 'unpaid', 'for-verification', 'verified', 'ready-for-release', 'released'];
    const sorted = [...order].reverse().sort((a, b) => CLAMP_STATES[a].order - CLAMP_STATES[b].order);
    expect(sorted).toEqual(order);
    expect(order.filter((k) => !CLAMP_STATES[k].settled)).toEqual(['overdue', 'unpaid', 'for-verification']);
  });

  test('time left before the ₱2,000 fee', () => {
    expect(graceLeftText({ recordedAt: ts(now - 2 * H) }, now)).toBe('22h 0m left');
    expect(graceLeftText({ recordedAt: ts(now - 23.5 * H) }, now)).toBe('30m left');
    expect(graceLeftText({ recordedAt: ts(now - 25 * H) }, now)).toBeNull();
  });
});
