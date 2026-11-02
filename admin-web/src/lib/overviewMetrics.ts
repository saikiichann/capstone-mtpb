/* ------------------------------------------------------------------
   OVERVIEW METRICS — OIC and Supervisor homepage cards

   Counted from the data the system actually writes (the old cards read
   `clampingRecords` / `releaseRequests`, which nothing writes, and payment
   statuses that don't exist, so they always showed 0 / ₱0):

     Active Clamps     clamped violations not yet released
     Impounded         impound violations not yet released, plus Add Impound
                       records still "Impounded" with no linked violation
     Pending Release   paid and verified, waiting for the OIC's approval or
                       for the Release Officer
     Pending Payments  payments waiting for Payment Verification
     Revenue Today     verified today (₱)
------------------------------------------------------------------ */
import { useEffect, useState } from "react";
import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { isImpoundViolation } from "./impoundFlag";
import { normalizePayment } from "./financeReport";

export type OverviewMetrics = {
  activeClamps: number;
  impounded: number;
  pendingRelease: number;
  pendingPayments: number;
  revenueToday: number;
};

const isReleased = (v: DocumentData) => String(v.releaseStatus ?? "") === "Released";

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function useOverviewMetrics(): OverviewMetrics {
  const [violations, setViolations] = useState<DocumentData[]>([]);
  const [records, setRecords] = useState<DocumentData[]>([]);
  const [payments, setPayments] = useState<{ id: string; data: DocumentData }[]>([]);

  useEffect(() => {
    const stops = [
      onSnapshot(
        collection(db, "violations"),
        (snap) => setViolations(snap.docs.map((d) => d.data())),
        (err) => console.warn("Overview: violations not loaded:", err.code)
      ),
      onSnapshot(
        collection(db, "impoundRecords"),
        (snap) => setRecords(snap.docs.map((d) => d.data())),
        (err) => console.warn("Overview: impound records not loaded:", err.code)
      ),
      onSnapshot(
        collection(db, "payments"),
        (snap) => setPayments(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
        (err) => console.warn("Overview: payments not loaded:", err.code)
      ),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  const today = new Date();
  const items = payments.map((p) => normalizePayment(p.id, p.data));

  return {
    activeClamps: violations.filter(
      (v) => String(v.enforcementType ?? "").toLowerCase() === "clamped" && !isReleased(v)
    ).length,
    impounded:
      violations.filter((v) => isImpoundViolation(v) && !isReleased(v)).length +
      records.filter(
        (r) => String(r.status ?? "").toLowerCase() === "impounded" && !r.sourceViolationId
      ).length,
    pendingRelease: violations.filter((v) =>
      ["Awaiting OIC Approval", "Approved by OIC"].includes(String(v.releaseStatus ?? ""))
    ).length,
    pendingPayments: items.filter((p) => p.state === "Pending Verification").length,
    revenueToday: items
      .filter((p) => p.state === "Verified" && (p.verifiedAt ?? p.receivedAt) && sameDay((p.verifiedAt ?? p.receivedAt)!, today))
      .reduce((sum, p) => sum + p.amount, 0),
  };
}
