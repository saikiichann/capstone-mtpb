import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
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

   Ayon sa Firestore rules, OIC at Impounding Staff ang puwedeng gumawa
   ng impoundRecords. Kapag may record na, update na iyon (Impounding
   Staff lang), kaya laging i-check muna gamit ang useImpoundRecordIds().
------------------------------------------------------------------ */

export const IMPOUND_FEE = 2000;

/**
 * Impound fee: ₱2,000 kapag NA-IMPOUND na ang sasakyan (impoundStatus
 * "Impounded", o "Released" kung na-release na bago mabayaran). Wala pa
 * kapag "Subject to Impound" o "Scheduled" lang.
 *
 * PINAPALITAN nito ang clamp fine — hindi dinadagdag. Kapag impounded,
 * ₱2,000 ang buong babayaran (hindi ₱900 + ₱2,000). Tingnan ang
 * amountDue() sa ibaba.
 */
export const impoundFeeDue = (impoundStatus: unknown, storedFee?: unknown): number => {
  const status = String(impoundStatus ?? "").toLowerCase().trim();
  if (status !== "impounded" && status !== "released") return 0;
  const fee = Number(storedFee);
  return Number.isFinite(fee) && fee > 0 ? fee : IMPOUND_FEE;
};

/** Babayaran: ang impound fee kapag impounded na, kung hindi ang clamp fine. */
export const amountDue = (fineAmount: number, impoundFee: number): number =>
  impoundFee > 0 ? impoundFee : fineAmount;

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

/**
 * Sabay na i-update ang CLAMP na may hawak sa violation, para alam din ng
 * clamp record (QR Management, at ng violator app pag-scan ng QR) na
 * Subject to Impound / Scheduled / Impounded na ito.
 *
 * Hinahanap ang clamp sa currentViolationId (fallback: clampId ng
 * violation). Hindi ginagalaw ang clamp kung iba na ang violation nito.
 * Best effort — hindi pinapabagsak ang pag-flag o pag-save kapag pumalya.
 */
export const syncClampImpound = async (
  violationId: string,
  impoundStatus: string,
  clampId?: string | null
): Promise<void> => {
  try {
    let snap = await getDocs(
      query(collection(db, "clamps"), where("currentViolationId", "==", violationId), limit(1))
    );
    if (snap.empty && clampId) {
      snap = await getDocs(
        query(collection(db, "clamps"), where("clampId", "==", clampId), limit(1))
      );
    }
    if (snap.empty) return;

    const clamp = snap.docs[0];
    const current = clamp.data().currentViolationId;
    if (current && current !== violationId) return;

    const status = impoundStatus.toLowerCase();
    await updateDoc(clamp.ref, {
      impoundStatus,
      // ₱2,000 ang babayaran kapag Impounded na (pinapalitan ang fine).
      impoundFee: status === "released" ? null : IMPOUND_FEE,
      impoundUpdatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Clamp impound status not updated:", err);
  }
};
