import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
export type ClampState =
  | "available"
  | "unpaid"
  | "verified"
  | "ready-for-release"
  | "released";

export type EnforcementType = "clamped" | "impounded";

export const deriveState = (data: {
  releasedAt: Timestamp | null;
  readyAt: Timestamp | null;
  paidAt: Timestamp | null;
  deployedAt: Timestamp | null;
  cin: string | null;
  currentViolationId: string | null;
}): ClampState => {
  if (data.releasedAt) return "released";
  if (data.readyAt) return "ready-for-release";
  if (data.paidAt) return "verified";
  if (data.deployedAt || data.cin || data.currentViolationId) return "unpaid";
  return "available";
};

// ---------------------------------------------------------------------------
// CIN
// ---------------------------------------------------------------------------
export const getCinPrefix = (enforcementType: EnforcementType): string => {
  return enforcementType === "clamped" ? "CLM" : "IMP";
};

export const validateCinFormat = (cin: string): boolean => {
  // Format: CLM-2026-0055 o IMP-2026-0056
  return /^(CLM|IMP)-\d{4}-\d{4}$/.test(cin);
};

export const generateCin = async (
  enforcementType: EnforcementType,
  year: number = new Date().getFullYear()
): Promise<string> => {
  const prefix = getCinPrefix(enforcementType);

  const q = query(
    collection(db, "violations"),
    where("cin", ">=", `${prefix}-${year}-0000`),
    where("cin", "<=", `${prefix}-${year}-9999`),
    orderBy("cin", "desc"),
    limit(1)
  );

  const snap = await getDocs(q);
  let nextSeq = 1;

  if (!snap.empty) {
    const lastCin = snap.docs[0].data().cin as string;
    if (validateCinFormat(lastCin)) {
      const lastSeq = parseInt(lastCin.split("-")[2], 10);
      if (!Number.isNaN(lastSeq)) {
        nextSeq = lastSeq + 1;
      }
    }
  }

  const seq = String(nextSeq).padStart(4, "0");
  return `${prefix}-${year}-${seq}`;
};

export const issueViolationForClamp = async (params: {
  clampDocId: string;
  clampId: string;
  enforcementType: EnforcementType;
  plateNo: string;
  make?: string | null;
  vehicleType?: string | null;
  color?: string | null;
  violationType: string;
  fineAmount: number;
  location: string;
  barangay?: string | null;
  sectorId?: string | null;
  officerName: string;
  photoUrl?: string | null;
}): Promise<{ violationId: string; cin: string }> => {
  const cin = await generateCin(params.enforcementType);

  const violationRef = doc(collection(db, "violations"));
  const clampRef = doc(db, "clamps", params.clampDocId);

  const batch = writeBatch(db);

  batch.set(violationRef, {
    cin,
    clampId: params.clampId,

    // Vehicle info
    plateNo: params.plateNo.trim().toUpperCase(),
    make: params.make ?? null,
    vehicleType: params.vehicleType ?? null,
    color: params.color ?? null,

    // Violation info
    violationType: params.violationType,
    fineAmount: params.fineAmount,
    location: params.location,
    barangay: params.barangay ?? null,
    sectorId: params.sectorId ?? null,
    officer: params.officerName,
    photoUrl: params.photoUrl ?? null,
    recordedAt: serverTimestamp(),

    enforcementType: params.enforcementType,
    convenienceFee: null,
    totalPaid: null,
    referenceNumber: null,
    paidAt: null,
    paymentStatus: "Unpaid",
    paymentMethod: null,
    paymentReference: null,
    verifiedAt: null,
    verifiedBy: null,
    releaseStatus: "Pending",
  });

  batch.update(clampRef, {
    status: "unpaid",
    cin,
    currentViolationId: violationRef.id,
    deployedAt: serverTimestamp(),
    deployedBy: params.officerName,
  });

  await batch.commit();

  return { violationId: violationRef.id, cin };
};