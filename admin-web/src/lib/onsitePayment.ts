import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { clientIp } from "./staffSession";

export type OnsitePaymentParams = {
  violationId: string;
  /** CIN ng violation (Clamp: CLM-YYYY-####, Impound: IMP-YYYY-####) */
  cin: string;
  /** UOVR No. kung impounded (Blue Ticket reference) */
  uovrNo?: string | null;
  plateNo: string;
  /** Clamp fine lang (₱900 o ₱2,000 kapag overdue). 0 kapag impounded. */
  fineAmount: number;
  /**
   * Impound fee galing sa impoundRecords (per weight class + per km).
   * 0 kung clamp lang (hindi impounded).
   */
  impoundFee: number;
  /**
   * True kapag impound ang violation (enforcementType "impounded" o
   * naka-impound na). Impound = bayad na, verified at released agad —
   * walang Payment Verification, Release Request o Release Queue.
   * Kapag hindi ibinigay: impound kung may impoundFee.
   */
  isImpound?: boolean;
  /** Para sa release log (impound lang). */
  location?: string | null;
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

export type OnsitePaymentResult = {
  referenceNumber: string;
  orNumber: string;
  paymentId: string;
  /** True kapag impound: verified at released na agad. */
  released: boolean;
  /** ORD-YYYY-NNNNN kapag released (impound). */
  releaseOrderId: string | null;
};

export const recordOnsitePayment = async (
  params: OnsitePaymentParams
): Promise<OnsitePaymentResult> => {
  const impounded = params.isImpound ?? params.impoundFee > 0;
  const total = impounded && params.impoundFee > 0 ? params.impoundFee : params.fineAmount;
  /** Fine actually charged: none once an impound fee replaces it. */
  const fineCharged = impounded && params.impoundFee > 0 ? 0 : params.fineAmount;
  const paymentLocation = params.counterLocation;
  const cashReceived = Math.max(total, Number(params.cashReceived ?? total) || total);
  const cashChange = cashReceived - total;
  const roleLabel = params.recordedByRole === "oic" ? "OIC" : "Finance";

  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", "paymentReference");
  const orCounterRef = doc(db, "counters", "orNumber");
  const releaseCounterRef = doc(db, "counters", "releaseOrder");
  const violationRef = doc(db, "violations", params.violationId);
  const paymentRef = doc(collection(db, "payments"));
  const releaseLogRef = doc(collection(db, "releaseLog"));
  const auditRef = doc(collection(db, "auditLogs"));

  // Impound na galing sa clamp (lumang flow): ibalik din ang clamp sa
  // "available". Query ito, kaya nasa labas ng transaction.
  let clampRef: ReturnType<typeof doc> | null = null;
  if (impounded) {
    try {
      const clampSnap = await getDocs(
        query(
          collection(db, "clamps"),
          where("currentViolationId", "==", params.violationId),
          limit(1)
        )
      );
      if (!clampSnap.empty) clampRef = clampSnap.docs[0].ref;
    } catch (err) {
      console.warn("Clamp lookup failed; clamp not reset:", err);
    }
  }

  const result = await runTransaction(db, async (tx) => {
    // --- Reads first (Firestore: all reads before any write) ---
    const counterSnap = await tx.get(counterRef);
    const orCounterSnap = await tx.get(orCounterRef);
    const releaseCounterSnap = impounded ? await tx.get(releaseCounterRef) : null;

    const nextRef = (counterSnap.exists() ? Number(counterSnap.data().lastValue ?? 0) : 0) + 1;
    const referenceNumber = `REF-${year}-${String(nextRef).padStart(5, "0")}`;

    const nextOr = (orCounterSnap.exists() ? Number(orCounterSnap.data().lastValue ?? 0) : 0) + 1;
    const orNumber = `OR-${year}-${String(nextOr).padStart(5, "0")}`;

    let releaseOrderId: string | null = null;
    if (impounded && releaseCounterSnap) {
      const nextOrder =
        (releaseCounterSnap.exists() ? Number(releaseCounterSnap.data().lastValue ?? 0) : 0) + 1;
      releaseOrderId = `ORD-${year}-${String(nextOrder).padStart(5, "0")}`;
      tx.set(
        releaseCounterRef,
        { lastValue: nextOrder, prefix: "ORD", updatedAt: serverTimestamp() },
        { merge: true }
      );
    }

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

    // Impound: bayad = verified + released agad (walang verification step).
    const settledFields = impounded
      ? {
          paymentStatus: "Verified",
          verificationStatus: "Verified",
          verifiedAt: serverTimestamp(),
          verifiedBy: params.officerName,
          verifiedByRole: params.recordedByRole,
          releaseStatus: "Released",
          releaseOrderId,
          releasedAt: serverTimestamp(),
          releasedBy: params.officerName,
          releaseDurationMinutes: 0,
          // Firestore rules: OIC lang ang puwedeng magpalit ng impoundStatus.
          // Sa Finance, releaseStatus "Released" na ang basehan ng mga log.
          ...(params.recordedByRole === "oic" ? { impoundStatus: "Released" } : {}),
        }
      : { paymentStatus: "Pending Verification" };

    tx.update(violationRef, {
      ...settledFields,
      paymentMethod: "Cash",
      paymentReference: referenceNumber,
      referenceNumber,
      orNumber,
      // Impound-related fields (0 kapag clamp lang)
      impoundFeePaid: impounded ? total : 0,
      // Payment totals
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
      uovrNo: params.uovrNo ?? null,
      plateNo: params.plateNo,
      violatorUid: params.violatorUid,
      guestId: params.guestId,
      violatorName: params.violatorName,
      // Amounts
      fineAmount: fineCharged,
      impoundFee: impounded ? total : 0,
      chargeType: impounded ? "Impound" : "Clamp",
      amount: total,
      convenienceFee: 0,
      totalAmount: total,
      cashReceived,
      cashChange,
      amountInWords: params.amountInWords,
      // References
      referenceNumber,
      orNumber,
      paymentLocation,
      // Status — impound: verified na agad (tinanggap ng staff in person)
      method: "Cash",
      ...(impounded
        ? {
            status: "Verified",
            verificationStatus: "Verified",
            verifiedBy: params.officerName,
            verifiedByRole: params.recordedByRole,
            verifiedAt: serverTimestamp(),
            releaseOrderId,
          }
        : { status: "Pending Verification", verificationStatus: null }),
      // Recorded by
      recordedBy: params.officerName,
      recordedByRole: params.recordedByRole,
      createdAt: serverTimestamp(),
      orIssuedAt: serverTimestamp(),
      orIssuedBy: params.officerName,
    });

    if (impounded && clampRef) {
      tx.update(clampRef, {
        status: "available",
        cin: null,
        currentViolationId: null,
        deployedAt: null,
        deployedBy: null,
        paidAt: null,
        readyAt: null,
        releasedAt: null,
        impoundStatus: null,
        impoundFee: null,
        impoundUpdatedAt: null,
        lastReleasedAt: serverTimestamp(),
        lastReleasedBy: params.officerName,
        lastReleasedCin: params.cin,
      });
    }

    if (impounded) {
      // Release log — para lumabas sa Release Log gaya ng ibang release.
      tx.set(releaseLogRef, {
        orderId: releaseOrderId,
        violationId: params.violationId,
        cin: params.cin,
        uovrNo: params.uovrNo ?? null,
        plateNo: params.plateNo,
        clampId: null,
        location: params.location ?? null,
        chargeType: "Impound",
        releasedBy: params.officerName,
        releasedByRole: params.recordedByRole,
        releaseDurationMinutes: 0,
        totalPaid: total,
        releasedAt: serverTimestamp(),
      });
    }

    tx.set(auditRef, {
      userName: params.officerName,
      userRole: params.recordedByRole,
      action: impounded
        ? `received impound payment for ${params.cin} — OR #${orNumber}, Ref ${referenceNumber}, ₱${total.toLocaleString()}, Location: ${paymentLocation}; verified and released (${releaseOrderId}) by ${roleLabel}`
        : `recorded cash payment for ${params.cin} — OR #${orNumber}, Ref ${referenceNumber}, Location: ${paymentLocation}, clamp fine ₱${params.fineAmount.toLocaleString()}`,
      record: params.cin,
      type: impounded ? "impound-payment" : "cash-payment",
      metadata: {
        cin: params.cin,
        uovrNo: params.uovrNo ?? null,
        plateNo: params.plateNo,
        fineAmount: fineCharged,
        clampFine: impounded ? 0 : params.fineAmount,
        impoundFee: impounded ? total : 0,
        amountDue: total,
        amountInWords: params.amountInWords,
        method: "Cash",
        referenceNumber,
        orNumber,
        paymentLocation,
        paymentId: paymentRef.id,
        released: impounded,
        releaseOrderId,
        violatorUid: params.violatorUid,
        guestId: params.guestId,
        violatorName: params.violatorName,
      },
      timestamp: serverTimestamp(),
      ipAddress: clientIp(),
    });

    return {
      referenceNumber,
      orNumber,
      paymentId: paymentRef.id,
      released: impounded,
      releaseOrderId,
    };
  });

  if (result.released) {
    await syncImpoundRecordReleased(params.violationId, {
      officerName: params.officerName,
      referenceNumber: result.referenceNumber,
      orNumber: result.orNumber,
      releaseOrderId: result.releaseOrderId,
      amountPaid: total,
    });
  }

  return result;
};

/**
 * Kung may impoundRecords na naka-link sa violation (doc id = violation id,
 * o sourceViolationId), gawing "Released" din para tugma ang Impounding Log.
 * Best effort: hindi nito binabagsak ang bayad kung hindi ma-update.
 */
const syncImpoundRecordReleased = async (
  violationId: string,
  info: {
    officerName: string;
    referenceNumber: string;
    orNumber: string;
    releaseOrderId: string | null;
    amountPaid: number;
  }
): Promise<void> => {
  try {
    const refs = new Map<string, ReturnType<typeof doc>>();
    const direct = doc(db, "impoundRecords", violationId);
    if ((await getDoc(direct)).exists()) refs.set(direct.path, direct);
    const linked = await getDocs(
      query(collection(db, "impoundRecords"), where("sourceViolationId", "==", violationId), limit(5))
    );
    linked.docs.forEach((d) => refs.set(d.ref.path, d.ref));

    await Promise.all(
      [...refs.values()].map((ref) =>
        updateDoc(ref, {
          status: "Released",
          paymentStatus: "Verified",
          referenceNumber: info.referenceNumber,
          orNumber: info.orNumber,
          releaseOrderId: info.releaseOrderId,
          amountPaid: info.amountPaid,
          paidAt: serverTimestamp(),
          releasedAt: serverTimestamp(),
          releasedBy: info.officerName,
          updatedAt: serverTimestamp(),
          updatedBy: info.officerName,
        })
      )
    );
  } catch (err) {
    console.warn("Impound record not marked Released:", err);
  }
};

/**
 * GCash (or any) impound payment just VERIFIED in Payment Verification:
 * release right away, like a cash impound payment — no Release Request or
 * Release Queue. Gives it an ORD number, a release-log entry, and marks
 * the linked impound record Released.
 */
export const releaseImpoundAfterVerification = async (params: {
  violationId: string;
  cin: string;
  plateNo: string;
  uovrNo?: string | null;
  location?: string | null;
  totalPaid: number;
  referenceNumber?: string | null;
  orNumber?: string | null;
  officerName: string;
  role: "oic" | "finance";
}): Promise<string> => {
  const year = new Date().getFullYear();
  const releaseCounterRef = doc(db, "counters", "releaseOrder");
  const violationRef = doc(db, "violations", params.violationId);
  const releaseLogRef = doc(collection(db, "releaseLog"));
  const auditRef = doc(collection(db, "auditLogs"));

  const releaseOrderId = await runTransaction(db, async (tx) => {
    const snap = await tx.get(releaseCounterRef);
    const next = (snap.exists() ? Number(snap.data().lastValue ?? 0) : 0) + 1;
    const orderId = `ORD-${year}-${String(next).padStart(5, "0")}`;
    tx.set(
      releaseCounterRef,
      { lastValue: next, prefix: "ORD", updatedAt: serverTimestamp() },
      { merge: true }
    );
    tx.update(violationRef, {
      releaseStatus: "Released",
      releaseOrderId: orderId,
      releasedAt: serverTimestamp(),
      releasedBy: params.officerName,
      releaseDurationMinutes: 0,
      updatedAt: serverTimestamp(),
      updatedBy: params.officerName,
      // Firestore rules: only the OIC may change impoundStatus.
      ...(params.role === "oic" ? { impoundStatus: "Released" } : {}),
    });
    tx.set(releaseLogRef, {
      orderId,
      violationId: params.violationId,
      cin: params.cin,
      uovrNo: params.uovrNo ?? null,
      plateNo: params.plateNo,
      clampId: null,
      location: params.location ?? null,
      chargeType: "Impound",
      releasedBy: params.officerName,
      releasedByRole: params.role,
      releaseDurationMinutes: 0,
      totalPaid: params.totalPaid,
      releasedAt: serverTimestamp(),
    });
    tx.set(auditRef, {
      userName: params.officerName,
      userRole: params.role,
      action: `released impounded vehicle ${params.cin} (${orderId}) after verifying its payment`,
      record: params.cin,
      type: "impound-release",
      metadata: { cin: params.cin, plateNo: params.plateNo, orderId, totalPaid: params.totalPaid },
      timestamp: serverTimestamp(),
      ipAddress: clientIp(),
    });
    return orderId;
  });

  await syncImpoundRecordReleased(params.violationId, {
    officerName: params.officerName,
    referenceNumber: params.referenceNumber ?? "",
    orNumber: params.orNumber ?? "",
    releaseOrderId,
    amountPaid: params.totalPaid,
  });
  return releaseOrderId;
};
