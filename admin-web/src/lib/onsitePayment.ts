import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

/* ------------------------------------------------------------------
   onsitePayment
   Pag-record ng bayad na tinanggap ng staff mismo (counter sa City Hall
   o sa MTPB Central / impound area): Cash, o GCash na binayaran sa QR ng
   MTPB at ine-encode ng staff ang GCash reference no.

   - Pareho sa dati: REF + OR number, violation → "Pending Verification",
     payment record, audit log. Iba pang staff ang magve-verify.
   - Ang babayaran = fine + impound fee (₱2,000 kapag Impounded na).
   - GCash → paymentLocation "Online" (Central Finance + OIC ang sakop,
     ayon sa lib/paymentLocation.ts).
------------------------------------------------------------------ */

export type OnsiteMethod = "Cash" | "GCash";

export type OnsitePaymentParams = {
  violationId: string;
  cin: string;
  plateNo: string;
  fineAmount: number;
  impoundFee: number;
  amountInWords: string;
  method: OnsiteMethod;
  /** Required for GCash: the reference no. on the payer's GCash receipt */
  gcashReference?: string;
  /** Cash only: amount handed over (≥ total). Change = cashReceived − total. */
  cashReceived?: number;
  /** Counter where the staff received it (City Hall / Central) */
  counterLocation: "City Hall" | "Central";
  recordedByRole: "finance" | "oic";
  officerName: string;
  violatorUid: string | null;
  guestId: string | null;
  violatorName: string | null;
};

/** GCash reference numbers are 13 digits; allow spaces when typed. */
export const normalizeGcashReference = (raw: string): string => raw.replace(/\s+/g, "");

export const isValidGcashReference = (raw: string): boolean =>
  /^\d{13}$/.test(normalizeGcashReference(raw));

/** True kapag nagamit na ang GCash reference sa ibang bayad. */
export const isGcashReferenceUsed = async (raw: string): Promise<boolean> => {
  const ref = normalizeGcashReference(raw);
  const snap = await getDocs(
    query(collection(db, "payments"), where("gcashReference", "==", ref), limit(1))
  );
  return !snap.empty;
};

export const recordOnsitePayment = async (
  params: OnsitePaymentParams
): Promise<{ referenceNumber: string; orNumber: string; paymentId: string }> => {
  const isGcash = params.method === "GCash";
  const gcashReference = isGcash ? normalizeGcashReference(params.gcashReference ?? "") : null;
  if (isGcash && !gcashReference) throw new Error("GCash reference no. is required.");

  const total = params.fineAmount + params.impoundFee;
  const paymentLocation = isGcash ? "Online" : params.counterLocation;
  const cashReceived = isGcash ? 0 : Math.max(total, Number(params.cashReceived ?? total) || total);
  const cashChange = isGcash ? 0 : cashReceived - total;

  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", "paymentReference");
  const orCounterRef = doc(db, "counters", "orNumber");
  const violationRef = doc(db, "violations", params.violationId);
  const paymentRef = doc(collection(db, "payments"));
  const auditRef = doc(collection(db, "auditLogs"));

  return runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const nextRef = (counterSnap.exists() ? Number(counterSnap.data().lastValue ?? 0) : 0) + 1;
    const referenceNumber = `REF-${year}-${String(nextRef).padStart(5, "0")}`;

    const orCounterSnap = await tx.get(orCounterRef);
    const nextOr = (orCounterSnap.exists() ? Number(orCounterSnap.data().lastValue ?? 0) : 0) + 1;
    const orNumber = `OR-${year}-${String(nextOr).padStart(5, "0")}`;

    tx.set(
      counterRef,
      { lastValue: nextRef, prefix: "REF", updatedAt: serverTimestamp() },
      { merge: true }
    );
    tx.set(
      orCounterRef,
      { lastValue: nextOr, prefix: "OR", updatedAt: serverTimestamp() },
      { merge: true }
    );

    tx.update(violationRef, {
      paymentStatus: "Pending Verification",
      paymentMethod: params.method,
      paymentReference: referenceNumber,
      referenceNumber,
      orNumber,
      gcashReference,
      impoundFeePaid: params.impoundFee,
      totalPaid: total,
      cashReceived,
      cashChange,
      amountInWords: params.amountInWords,
      paymentLocation,
      paidAt: serverTimestamp(),
      cashRecordedBy: params.officerName,
      cashRecordedByRole: params.recordedByRole,
      orIssuedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: params.officerName,
      violatorUid: params.violatorUid,
      guestId: params.guestId,
      violatorName: params.violatorName,
    });

    tx.set(paymentRef, {
      violationId: params.violationId,
      cin: params.cin,
      plateNo: params.plateNo,
      violatorUid: params.violatorUid,
      guestId: params.guestId,
      violatorName: params.violatorName,
      fineAmount: params.fineAmount,
      impoundFee: params.impoundFee,
      amount: total,
      convenienceFee: 0,
      totalAmount: total,
      cashReceived,
      cashChange,
      amountInWords: params.amountInWords,
      referenceNumber,
      orNumber,
      gcashReference,
      paymentLocation,
      receivedAt: params.counterLocation,
      method: params.method,
      status: "Pending Verification",
      verificationStatus: null,
      recordedBy: params.officerName,
      recordedByRole: params.recordedByRole,
      createdAt: serverTimestamp(),
      orIssuedAt: serverTimestamp(),
      orIssuedBy: params.officerName,
    });

    tx.set(auditRef, {
      userName: params.officerName,
      userRole: params.recordedByRole,
      action:
        `recorded ${params.method} payment for ${params.cin} — OR #${orNumber}, Ref ${referenceNumber}` +
        (isGcash ? `, GCash Ref ${gcashReference}` : `, Location: ${paymentLocation}`) +
        (params.impoundFee > 0 ? `, incl. impound fee ₱${params.impoundFee.toLocaleString()}` : ""),
      record: params.cin,
      type: isGcash ? "gcash-onsite-payment" : "cash-payment",
      metadata: {
        cin: params.cin,
        plateNo: params.plateNo,
        fineAmount: params.fineAmount,
        impoundFee: params.impoundFee,
        amountDue: total,
        amountInWords: params.amountInWords,
        method: params.method,
        gcashReference,
        referenceNumber,
        orNumber,
        paymentLocation,
        receivedAt: params.counterLocation,
        paymentId: paymentRef.id,
        violatorUid: params.violatorUid,
        guestId: params.guestId,
        violatorName: params.violatorName,
      },
      timestamp: serverTimestamp(),
    });

    return { referenceNumber, orNumber, paymentId: paymentRef.id };
  });
};
