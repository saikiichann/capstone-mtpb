import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Transaction,
  type WriteBatch,
} from "firebase/firestore";
import { db } from "../firebase";

/* ------------------------------------------------------------------
   impoundFlag
   Iisang paraan ng pag-flag ng "Subject to Impound" para sa Clamping Log
   at Pending Payments.

   Kapag na-flag ang isang clamped violation, kailangan din nito ng
   impoundRecords entry (doc id = violation id). Iyon ang binabasa ng
   Active Impounding, ng Impounding Staff pages at ng Impounding Log —
   kung wala ito, hindi makakarating sa impounding side ang sasakyan.

   Ayon sa Firestore rules, OIC lang ang puwedeng gumawa ng
   impoundRecords. Kapag may record na, update na iyon (Impounding Staff
   lang), kaya laging i-check muna gamit ang useImpoundRecordIds().
------------------------------------------------------------------ */

export const IMPOUND_FEE = 2000;

/** Ang kailangang detalye ng violation para gumawa ng impound record. */
export type ImpoundRecordSource = {
  id: string;
  reference: string | null;
  cin: string;
  plateNo: string;
  location: string;
  violation: string;
  officer: string;
  recordedAt: Timestamp | null;
};

/**
 * IDs ng violations na may impoundRecords na (doc id o sourceViolationId).
 * null habang naglo-load — huwag munang mag-flag hangga't null.
 */
export function useImpoundRecordIds(): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "impoundRecords"),
      (snap) => {
        const next = new Set<string>();
        snap.docs.forEach((d) => {
          next.add(d.id);
          const source = d.data().sourceViolationId;
          if (typeof source === "string" && source) next.add(source);
        });
        setIds(next);
      },
      (err) => console.warn("impoundRecords fetch failed:", err.code)
    );
    return () => unsubscribe();
  }, []);

  return ids;
}

const buildImpoundRecord = (
  source: ImpoundRecordSource,
  opts: { autoFlagged: boolean; createdBy: string }
) => ({
  sourceViolationId: source.id,
  referenceNumber: source.reference,
  cin: source.cin,
  plateNo: source.plateNo,
  location: source.location,
  initialViolation: source.violation,
  clampedBy: source.officer,
  // Oras ng pag-clamp, hindi ng pag-flag — dito binibilang ng Impounding
  // Staff pages ang "hours overdue".
  clampedAt: source.recordedAt,
  status: "Subject to Impound",
  impoundFee: IMPOUND_FEE,
  autoFlagged: opts.autoFlagged,
  createdBy: opts.createdBy,
  createdAt: serverTimestamp(),
});

/** Idagdag sa batch ang paggawa ng impound record. */
export const setImpoundRecord = (
  batch: WriteBatch,
  source: ImpoundRecordSource,
  opts: { autoFlagged: boolean; createdBy: string }
): void => {
  batch.set(doc(db, "impoundRecords", source.id), buildImpoundRecord(source, opts));
};

/** Pareho, pero para sa runTransaction. */
export const setImpoundRecordInTransaction = (
  tx: Transaction,
  source: ImpoundRecordSource,
  opts: { autoFlagged: boolean; createdBy: string }
): void => {
  tx.set(doc(db, "impoundRecords", source.id), buildImpoundRecord(source, opts));
};
