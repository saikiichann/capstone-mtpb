/* ------------------------------------------------------------------
   CLAMP FEE — per MTPB (client instruction)

   A clamped vehicle stays clamped until it is paid and released; it is
   NOT sent to impound for being late. What changes is the amount:

     - Within 24 hours of clamping:  the clamp fine (₱900)
     - After 24 hours:               ₱2,000 fixed — the same at 25 hours
                                     or 48+ hours; it does not grow.

   The ₱2,000 REPLACES the ₱900 (it is not added on top).

   Once a payment is recorded, the amount paid (totalPaid) is what counts,
   so a payment made before the 24 hours stays at ₱900 even if it is
   verified later.

   Impounding is a separate process (Blue Ticket / OVR No.) and does not
   come from clamps.
------------------------------------------------------------------ */

export const CLAMP_GRACE_HOURS = 24;
export const CLAMP_OVERDUE_FEE = 2000;

type ViolationLike = {
  enforcementType?: unknown;
  clampId?: unknown;
  fineAmount?: unknown;
  totalPaid?: unknown;
  recordedAt?: unknown;
  gracePeriodEnd?: unknown;
  paymentStatus?: unknown;
  /** Any Firestore violation document fits */
  [key: string]: unknown;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === "number" || typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

export const isClamped = (data: ViolationLike): boolean =>
  String(data.enforcementType ?? "").toLowerCase() === "clamped";

/** When the 24-hour grace period ends (gracePeriodEnd, else recordedAt + 24 h). */
export const graceEndsAt = (data: ViolationLike): Date | null => {
  const stored = toDate(data.gracePeriodEnd);
  if (stored) return stored;
  const recorded = toDate(data.recordedAt);
  return recorded ? new Date(recorded.getTime() + CLAMP_GRACE_HOURS * 3600000) : null;
};

/** True for a clamp whose 24 hours have passed (whether paid or not). */
export const isPastGrace = (data: ViolationLike, now: Date = new Date()): boolean => {
  if (!isClamped(data)) return false;
  const end = graceEndsAt(data);
  return !!end && now.getTime() >= end.getTime();
};

/** Paid in full already (a payment amount is on record). */
const paidAmount = (data: ViolationLike): number => {
  const paid = Number(data.totalPaid);
  return Number.isFinite(paid) && paid > 0 ? paid : 0;
};

/**
 * A clamp still to be paid whose 24 hours have passed — it is charged
 * the ₱2,000 overdue fee.
 */
export const isClampOverdue = (data: ViolationLike, now: Date = new Date()): boolean =>
  isPastGrace(data, now) &&
  paidAmount(data) === 0 &&
  !["verified", "pending verification"].includes(String(data.paymentStatus ?? "").toLowerCase());

/** The overdue fee that applies right now (0 when not overdue). */
export const overdueFeeFor = (data: ViolationLike, now: Date = new Date()): number =>
  isClampOverdue(data, now) ? CLAMP_OVERDUE_FEE : 0;

/**
 * What the owner pays: the amount already paid if there is one, else
 * ₱2,000 for an overdue clamp, else the fine.
 */
export const amountDueFor = (data: ViolationLike, now: Date = new Date()): number => {
  const paid = paidAmount(data);
  if (paid > 0) return paid;
  if (isClampOverdue(data, now)) return CLAMP_OVERDUE_FEE;
  return Number(data.fineAmount) || 0;
};

/** Hours left in the grace period (0 when it has ended). */
export const graceHoursLeft = (data: ViolationLike, now: Date = new Date()): number => {
  const end = graceEndsAt(data);
  if (!end) return 0;
  return Math.max(0, (end.getTime() - now.getTime()) / 3600000);
};
