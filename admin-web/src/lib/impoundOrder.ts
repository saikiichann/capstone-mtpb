/* ------------------------------------------------------------------
   IMPOUND LIST ORDER — newest saved record on top.

   The impound lists show the date of apprehension (typed in by the
   impounding staff), but they are ORDERED by when the record was saved
   (createdAt). Ordering by the typed date put a new entry below others
   whenever its apprehension time was earlier than theirs ("napunta sa
   3rd row").
------------------------------------------------------------------ */
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

const ms = (value: unknown): number => {
  const t = value as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === "function" ? t.toMillis() : 0;
};

/** When this impound record was saved; older records without it use the impound date. */
export function encodedAt(d: QueryDocumentSnapshot<DocumentData>): number {
  const data = d.data();
  if (data.createdAt) return ms(data.createdAt);
  // Just saved on this device: the server time hasn't come back yet.
  if (d.metadata.hasPendingWrites) return Date.now();
  return ms(data.clampedAt ?? data.ticketDate);
}
