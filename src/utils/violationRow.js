import { toMillis } from './clampState';

/**
 * One violation document → the plain fields the screens use (Home, Activity,
 * Violation Details). Times are millis so they can be passed between screens.
 */
export function toRow(docId, data) {
  return {
    docId,
    id: data.cin || docId,
    cin: data.cin || docId,
    recordedAt: toMillis(data.recordedAt),
    gracePeriodEnd: toMillis(data.gracePeriodEnd),
    paidAt: toMillis(data.paidAt),
    releasedAt: toMillis(data.releasedAt),
    location: data.location || '',
    barangay: data.barangay || '',
    address: data.address || null,
    locationCoords: data.locationCoords || null,
    plate: data.plateNo || '',
    plateNo: data.plateNo || '',
    make: data.vehicleMake || '',
    type: data.vehicleType || '',
    color: data.vehicleColor || '',
    violation: data.violationType || '',
    clampId: data.clampId || '',
    officer: data.officer || '',
    fineAmount: Number(data.fineAmount) || 0,
    totalPaid: data.totalPaid ?? null,
    paymentStatus: data.paymentStatus || 'Unpaid',
    releaseStatus: data.releaseStatus || 'Pending',
    photoUrl: data.photoUrl || null,
    photoStamped: data.photoStamped === true,
  };
}

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today · Fri, Oct 30" / "Yesterday · Thu, Oct 29" / "Mon, Oct 26". */
export function dayLabel(ms, now = new Date()) {
  if (!ms) return 'No date';
  const d = new Date(ms);
  const text = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
  if (sameDay(d, now)) return `Today · ${text}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `Yesterday · ${text}`;
  return d.getFullYear() === now.getFullYear()
    ? text
    : d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** "1:58 PM" today, else "Oct 26". */
export function shortTime(ms, now = new Date()) {
  if (!ms) return '—';
  const d = new Date(ms);
  return sameDay(d, now)
    ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export const timeOnly = (ms) =>
  ms ? new Date(ms).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '—';

export const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;
