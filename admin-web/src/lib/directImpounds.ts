/* ------------------------------------------------------------------
   DIRECT IMPOUNDS — impound violations issued by the enforcer app
   (enforcementType "impounded") that have no Add Impound record.

   The Impounding Logs of the Supervisor, Record Officer and Impounding
   Staff read `impoundRecords` only, so these never showed there (only the
   OIC's log merged both). useWithDirectImpounds() adds them to a page's
   rows; violationAsImpoundRecord() lets the "View" modal show one.

   Violations made by Add Impound Record already have an impoundRecordId
   (their record is in the list), so they are skipped here.
------------------------------------------------------------------ */
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase";

export type DirectImpoundRow = {
  id: string;
  recordId: string;
  uovrNo: string;
  reference: string | null;
  cin: string;
  plateNo: string;
  violation: string;
  location: string;
  officer: string;
  recordedAt: Timestamp | null;
  impoundFee: number;
  status: "Impounded" | "Released";
  /** True for rows from `violations` (no impound record to edit). */
  fromViolation: true;
};

const toRow = (id: string, data: DocumentData): DirectImpoundRow => ({
  id,
  recordId: id,
  uovrNo: data.uovrNo ?? "—",
  reference: (data.referenceNumber as string) ?? (data.paymentReference as string) ?? null,
  cin: data.cin ?? "—",
  plateNo: data.plateNo ?? "—",
  violation: data.violationType ?? "—",
  location: data.location ?? "—",
  officer: data.officer ?? "—",
  recordedAt: (data.recordedAt as Timestamp) ?? null,
  impoundFee: Number(data.impoundFee ?? data.totalPaid ?? data.fineAmount ?? 0),
  status: data.releaseStatus === "Released" ? "Released" : "Impounded",
  fromViolation: true,
});

const millis = (t: Timestamp | null) => {
  try {
    return t ? t.toMillis() : 0;
  } catch {
    return 0;
  }
};

/** A page's impound rows plus the enforcer's direct impounds, newest first. */
export function useWithDirectImpounds<T extends { recordedAt: Timestamp | null }>(
  rows: T[]
): (T | DirectImpoundRow)[] {
  const [direct, setDirect] = useState<DirectImpoundRow[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "violations"), where("enforcementType", "==", "impounded")),
      (snap) =>
        setDirect(
          snap.docs
            .filter((d) => !d.data().impoundRecordId)
            .map((d) => toRow(d.id, d.data()))
        ),
      (err) => console.warn("Direct impounds not loaded:", err.code)
    );
    return () => unsubscribe();
  }, []);

  return useMemo(
    () => [...rows, ...direct].sort((a, b) => millis(b.recordedAt) - millis(a.recordedAt)),
    [rows, direct]
  );
}

/** Violation → the field names the impound "View" modals display. */
export const violationAsImpoundRecord = (data: DocumentData): Record<string, unknown> => ({
  ...data,
  uovrNo: data.uovrNo ?? null,
  cin: data.cin ?? null,
  violatorName: data.violatorName ?? null,
  plateNo: data.plateNo ?? null,
  vehicleType: data.vehicleType ?? null,
  color: data.vehicleColor ?? data.color ?? null,
  initialViolation: data.violationType ?? null,
  impoundViolations: data.impoundViolations ?? [],
  location: data.impoundLocation ?? data.location ?? null,
  clampedBy: data.officer ?? null,
  apprehendingOfficer: data.officer ?? null,
  impoundFee: Number(data.impoundFee ?? data.totalPaid ?? data.fineAmount ?? 0),
  status: data.releaseStatus === "Released" ? "Released" : "Impounded",
  street: data.location ?? null,
});
