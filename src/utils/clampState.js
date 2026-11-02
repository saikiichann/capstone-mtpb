// ============================================================================
// Clamp states — the same states the admin's QR Management shows for a clamp,
// worked out here from the violation document so the enforcer can track
// whether a clamp has been settled.
//
//   Unpaid → Overdue (₱2,000 after 24 h) → For Verification → Verified
//          → Ready for Release → Released
//
// "For Verification" is the only extra one: the owner already paid (GCash or
// cash) and Finance/OIC still has to verify it.
// ============================================================================

export const CLAMP_GRACE_HOURS = 24;
export const CLAMP_OVERDUE_FEE = 2000;

export const CLAMP_STATES = {
  overdue: {
    label: 'Overdue (₱2,000)',
    short: 'OVERDUE',
    chip: 'Overdue',
    color: '#A61B1B',
    bg: '#FDE7E7',
    solid: '#D32F2F',
    group: 'overdue',
    order: 0,
    settled: false,
    note: 'Not paid within 24 hours. The fee is now ₱2,000.',
  },
  unpaid: {
    label: 'Unpaid',
    short: 'UNPAID',
    chip: 'Unpaid',
    color: '#7A4A00',
    bg: '#FFF1CC',
    solid: '#F0A500',
    group: 'unpaid',
    order: 1,
    settled: false,
    note: 'Waiting for the owner to pay.',
  },
  'for-verification': {
    label: 'For Verification',
    short: 'FOR VERIFICATION',
    chip: 'For Verification',
    color: '#1E3FA8',
    bg: '#E3EBFF',
    solid: '#2F5BEA',
    group: 'for-verification',
    order: 2,
    settled: false,
    note: 'Paid. Waiting for Finance/OIC to verify the payment.',
  },
  verified: {
    label: 'Verified',
    short: 'VERIFIED',
    chip: 'Verified',
    color: '#17663A',
    bg: '#DFF3E6',
    solid: '#23A455',
    group: 'for-release',
    order: 3,
    settled: true,
    note: 'Payment verified. Waiting for OIC release approval.',
  },
  'ready-for-release': {
    label: 'Ready for Release',
    short: 'READY FOR RELEASE',
    chip: 'Ready',
    color: '#17663A',
    bg: '#DFF3E6',
    solid: '#23A455',
    group: 'for-release',
    order: 4,
    settled: true,
    note: 'Approved by OIC. The Release Officer can remove the clamp.',
  },
  released: {
    label: 'Released',
    short: 'RELEASED',
    chip: 'Released',
    color: '#3A3F4A',
    bg: '#ECEDEF',
    solid: '#6B7280',
    group: 'released',
    order: 5,
    settled: true,
    note: 'Clamp removed and the vehicle was released.',
  },
  cancelled: {
    label: 'Cancelled',
    short: 'CANCELLED',
    chip: 'Cancelled',
    color: '#3A3F4A',
    bg: '#ECEDEF',
    solid: '#6B7280',
    group: 'released',
    order: 6,
    settled: true,
    note: 'This violation was cancelled.',
  },
};

/** Filter chips, in the same order as the list. */
export const STATE_FILTERS = [
  'overdue',
  'unpaid',
  'for-verification',
  'verified',
  'ready-for-release',
  'released',
];

/**
 * The Activity screen's five chips (redesign): "For Release" covers both
 * Verified and Ready for Release; Released and Cancelled show under All.
 * Each row still shows its exact state, the same as QR Management.
 */
export const ACTIVITY_CHIPS = [
  { key: 'all', label: 'All', dot: '#0E0F12' },
  { key: 'overdue', label: 'Overdue', dot: '#D32F2F' },
  { key: 'unpaid', label: 'Unpaid', dot: '#F0A500' },
  { key: 'for-verification', label: 'For Verification', dot: '#2F5BEA' },
  { key: 'for-release', label: 'For Release', dot: '#23A455' },
];

/** Does a state belong under a chip? */
export const inChip = (state, chipKey) =>
  chipKey === 'all' || CLAMP_STATES[state]?.group === chipKey;

/** Firestore Timestamp, Date, millis or ISO string → millis (or null). */
export const toMillis = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') {
    try {
      return value.toMillis();
    } catch {
      return null;
    }
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

/** When the 24-hour grace period ends (gracePeriodEnd, else recordedAt + 24 h). */
export const graceEndsAtMs = (v) => {
  const stored = toMillis(v.gracePeriodEnd);
  if (stored) return stored;
  const recorded = toMillis(v.recordedAt);
  return recorded ? recorded + CLAMP_GRACE_HOURS * 3600000 : null;
};

const lower = (value) => String(value ?? '').trim().toLowerCase();

/** The clamp state of a violation, using the same rules as QR Management. */
export function clampStateOf(v, now = Date.now()) {
  const release = lower(v.releaseStatus);
  const payment = lower(v.paymentStatus);

  if (release === 'cancelled') return 'cancelled';
  if (release === 'released' || toMillis(v.releasedAt)) return 'released';
  if (release === 'approved by oic') return 'ready-for-release';
  if (payment === 'verified') return 'verified';
  if (payment === 'pending verification' || payment === 'paid') return 'for-verification';

  const ends = graceEndsAtMs(v);
  if (ends && now >= ends) return 'overdue';
  return 'unpaid';
}

/** What the owner pays: amount already paid, else ₱2,000 if overdue, else the fine. */
export function amountDueOf(v, state) {
  const paid = Number(v.totalPaid);
  if (Number.isFinite(paid) && paid > 0) return paid;
  if (state === 'overdue') return CLAMP_OVERDUE_FEE;
  return Number(v.fineAmount ?? v.amount) || 0;
}

/** "5h 12m left" for an unpaid clamp, or null. */
export function graceLeftText(v, now = Date.now()) {
  const ends = graceEndsAtMs(v);
  if (!ends) return null;
  const left = ends - now;
  if (left <= 0) return null;
  const hours = Math.floor(left / 3600000);
  const mins = Math.floor((left % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
}
