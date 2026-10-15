import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/* ------------------------------------------------------------------
   onsitePayment
   Pag-record ng CASH na tinanggap ng staff mismo (counter sa City Hall,
   o sa MTPB Central / impound area). Ang GCash ay online, sa violator
   app (PWA) — hindi dito.

   - REF + OR number, violation → "Pending Verification", payment
     record, audit log. Iba pang staff ang magve-verify.
   - Ang babayaran = clamp fine (₱900) sa loob ng 24 oras, o ₱2,000
     overdue clamp fee kapag lumagpas na (pinapalitan ang fine — hindi
     dinadagdag). Tingnan ang lib/clampFee.ts.
   - Cash Received at Change ay sine-save para sa slip.
------------------------------------------------------------------ */

export type OnsitePaymentParams = {
  violationId: string;
  cin: string;
  plateNo: string;
  fineAmount: number;
  /** ₱2,000 when the clamp is past its 24 hours, else 0 (see lib/clampFee.ts) */
  overdueFee: number;
  amountInWords: string;
  /** Amount handed over (≥ total). Change = cashReceived − total. */
  cashReceived?: number;
  /** Counter where the staff received it (City Hall / Central) */
  counterLocation: "City Hall" | "Central";
  recordedByRole: "finance" | "oic";
  officerName: string;
  violatorUid: string | null;
  guestId: string | null;
  violatorName: string | null;
};

export const recordOnsitePayment = async (
  params: OnsitePaymentParams
): Promise<{ referenceNumber: string; orNumber: string; paymentId: string }> => {
  const overdue = params.overdueFee > 0;
  const total = overdue ? params.overdueFee : params.fineAmount;
  /** Fine actually charged: none when overdue (the ₱2,000 replaces it). */
  const fineCharged = overdue ? 0 : params.fineAmount;
  const paymentLocation = params.counterLocation;
  const cashReceived = Math.max(total, Number(params.cashReceived ?? total) || total);
  const cashChange = cashReceived - total;

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
      paymentMethod: "Cash",
      paymentReference: referenceNumber,
      referenceNumber,
      orNumber,
      overdueFeePaid: params.overdueFee,
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
      fineAmount: fineCharged,
      overdueFee: params.overdueFee,
      chargeType: overdue ? "Clamp (overdue)" : "Clamp",
      amount: total,
      convenienceFee: 0,
      totalAmount: total,
      cashReceived,
      cashChange,
      amountInWords: params.amountInWords,
      referenceNumber,
      orNumber,
      paymentLocation,
      method: "Cash",
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
        `recorded cash payment for ${params.cin} — OR #${orNumber}, Ref ${referenceNumber}, Location: ${paymentLocation}` +
        (overdue ? `, overdue clamp fee ₱${params.overdueFee.toLocaleString()}` : ""),
      record: params.cin,
      type: "cash-payment",
      metadata: {
        cin: params.cin,
        plateNo: params.plateNo,
        fineAmount: fineCharged,
        clampFine: params.fineAmount,
        overdueFee: params.overdueFee,
        amountDue: total,
        amountInWords: params.amountInWords,
        method: "Cash",
          referenceNumber,
        orNumber,
        paymentLocation,
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
