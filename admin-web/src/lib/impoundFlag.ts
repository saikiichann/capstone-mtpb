import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
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
   WEIGHT CLASS + FEE
------------------------------------------------------------------ */
export type VehicleWeightClass = "light" | "medium" | "heavy";

export const WEIGHT_CLASS_LABELS: Record<VehicleWeightClass, string> = {
  light: "Light (Cars, Taxis, Motorcycles, Tricycles, Pickups)",
  medium: "Medium (Vans, Small Trucks, Buses / PUB, Jeepneys / PUJ)",
  heavy: "Heavy (Container Vans, Trailers, Rig Trucks)",
};

/** Base impound fee per weight class. */
export const IMPOUND_BASE_FEES: Record<VehicleWeightClass, number> = {
  light: 1500,
  medium: 3500,
  heavy: 5000,
};

/** Dagdag sa bawat km pagkatapos ng free km. */
export const IMPOUND_PER_KM_FEE = 200;

/** First 5 km are free. */
export const IMPOUND_FREE_KM = 5;

/** Compute the impound fee based on weight class and distance. */
export const computeImpoundFee = (
  weightClass: VehicleWeightClass,
  distanceKm: number
): number => {
  const base = IMPOUND_BASE_FEES[weightClass];
  const extraKm = Math.max(0, distanceKm - IMPOUND_FREE_KM);
  return base + extraKm * IMPOUND_PER_KM_FEE;
};

/** Derive ang weight class mula sa vehicle type string. */
export const weightClassFromVehicleType = (
  vehicleType: unknown
): VehicleWeightClass => {
  const v = String(vehicleType ?? "").toLowerCase();
  if (v.includes("motor") || v.includes("tricycle")) return "light";
  // PUB (public utility bus) and PUJ (public utility jeepney) are the codes
  // in the Add Impound Record vehicle type list.
  const code = v.trim();
  if (code === "pub" || code === "puj") return "medium";
  if (
    v.includes("van") ||
    v.includes("truck") ||
    v.includes("bus") ||
    v.includes("jeep")
  ) {
    // Small truck / delivery van / bus → medium
    if (v.includes("container") || v.includes("trailer") || v.includes("rig"))
      return "heavy";
    return "medium";
  }
  if (v.includes("container") || v.includes("trailer") || v.includes("rig"))
    return "heavy";
  return "light";
};


export const impoundFeeDue = (
  impoundStatus: unknown,
  storedFee?: unknown,
  weightClass?: VehicleWeightClass,
  distanceKm?: number
): number => {
  const status = String(impoundStatus ?? "").toLowerCase().trim();
  if (status !== "impounded" && status !== "released") return 0;

  const fee = Number(storedFee);
  if (Number.isFinite(fee) && fee > 0) return fee;

  if (weightClass) return computeImpoundFee(weightClass, distanceKm ?? 0);
  return IMPOUND_BASE_FEES.light; // fallback
};

/**
 * True kapag impound ang violation: inissue ng enforcer bilang impound
 * (enforcementType "impounded") o naka-impound na (impoundStatus).
 * Ang bayad dito ay verified at released agad (lib/onsitePayment.ts).
 */
export const isImpoundViolation = (data: {
  enforcementType?: unknown;
  impoundStatus?: unknown;
}): boolean => {
  if (String(data.enforcementType ?? "").toLowerCase().trim() === "impounded") return true;
  const status = String(data.impoundStatus ?? "").toLowerCase().trim();
  return status === "impounded" || status === "released";
};

/** Compute the amount due for payment */
export const amountDue = (fineAmount: number, impoundFee: number): number =>
  impoundFee > 0 ? impoundFee : fineAmount;

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */
export type ImpoundStatus = "Impounded" | "Released";

export type ImpoundRecordSource = {
  id: string;
  reference: string | null;   // referenceNumber (REF)
  cin: string;
  plateNo: string;
  location: string;
  violation: string;
  officer: string;
  recordedAt: Timestamp | null;
};

/** Field that contains the data for an impound record. */
export type ImpoundRecordData = {
  // UOVR / ticket
  uovrNo: string;
  aorNo?: string | null;
  ticketDate?: Timestamp | null;
  street?: string | null;
  cityMun?: string | null;

  // Driver
  violatorName?: string | null;
  contactNo?: string | null;
  licenseNo?: string | null;

  // Vehicle
  plateNo: string;
  color?: string | null;
  vehicleType?: string | null;
  weightClass: VehicleWeightClass;

  // Violation
  initialViolation?: string | null;
  impoundViolations?: string[];

  // Impound location + distance
  location?: string | null;
  distanceKm: number;

  // Fees
  impoundFee: number;

  // Turn-over
  clampedBy?: string | null;   // enforcer / apprehending officer
  receivedBy?: string | null;

  // Status
  status: ImpoundStatus;
};

/* ------------------------------------------------------------------
   RECORD IDS HOOK — to check if a violation is already impounded
------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------
   RECORD BUILDERS
------------------------------------------------------------------ */
const buildImpoundRecord = (
  source: ImpoundRecordSource,
  data: ImpoundRecordData,
  opts: { createdBy: string }
) => ({
  // Link pabalik sa violation
  sourceViolationId: source.id,

  // Ticket
  uovrNo: data.uovrNo,
  aorNo: data.aorNo ?? null,
  ticketDate: data.ticketDate ?? null,
  street: data.street ?? null,
  cityMun: data.cityMun ?? null,

  // Reference / identifiers
  referenceNumber: source.reference,
  cin: source.cin,
  plateNo: data.plateNo || source.plateNo,

  // Driver
  violatorName: data.violatorName ?? null,
  contactNo: data.contactNo ?? null,
  licenseNo: data.licenseNo ?? null,

  // Vehicle
  color: data.color ?? null,
  vehicleType: data.vehicleType ?? null,
  weightClass: data.weightClass,

  // Violation
  initialViolation: data.initialViolation ?? source.violation,
  impoundViolations: data.impoundViolations ?? [],

  // Location / fee
  location: data.location ?? source.location,
  distanceKm: data.distanceKm,
  impoundFee: data.impoundFee,

  // Turn-over
  clampedBy: data.clampedBy ?? source.officer,
  receivedBy: data.receivedBy ?? opts.createdBy,

  // Timestamps
  clampedAt: source.recordedAt,
  status: data.status,

  // Meta
  createdBy: opts.createdBy,
  createdAt: serverTimestamp(),
});

/** Sets an impound record in the database. */
export const setImpoundRecord = (
  batch: WriteBatch,
  source: ImpoundRecordSource,
  data: ImpoundRecordData,
  opts: { createdBy: string }
): void => {
  batch.set(
    doc(db, "impoundRecords", source.id),
    buildImpoundRecord(source, data, opts)
  );
};

/** Same as setImpoundRecord, but for use within a transaction. */
export const setImpoundRecordInTransaction = (
  tx: Transaction,
  source: ImpoundRecordSource,
  data: ImpoundRecordData,
  opts: { createdBy: string }
): void => {
  tx.set(
    doc(db, "impoundRecords", source.id),
    buildImpoundRecord(source, data, opts)
  );
};

/* ------------------------------------------------------------------
   CLAMP SYNC — so the clamp doc will reflect the impound status of the violation
------------------------------------------------------------------ */
export const syncClampImpound = async (
  violationId: string,
  impoundStatus: string,
  clampId?: string | null
): Promise<void> => {
  try {
    let snap = await getDocs(
      query(
        collection(db, "clamps"),
        where("currentViolationId", "==", violationId),
        limit(1)
      )
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
      impoundUpdatedAt: serverTimestamp(),
      ...(status === "released" ? { impoundFee: null } : {}),
    });
  } catch (err) {
    console.warn("Clamp impound status not updated:", err);
  }
};
/* ------------------------------------------------------------------
   RELEASE GUARD — bayad muna bago "Released"
------------------------------------------------------------------ */
/**
 * Kapag may kasabay na violation ang impound record (galing sa Add
 * Impound Record), hindi ito puwedeng gawing "Released" ng Impounding
 * Staff hangga't hindi bayad. Ang OIC/Finance ang tumatanggap ng bayad sa
 * Pending Payments, at doon ito nare-release nang kusa.
 * Lumang record na walang link: walang harang (gaya ng dati).
 */
export const assertImpoundPaid = async (recordId: string): Promise<void> => {
  const record = await getDoc(doc(db, "impoundRecords", recordId));
  const violationId = record.exists() ? record.data().sourceViolationId : null;
  if (typeof violationId !== "string" || !violationId) return;

  const violation = await getDoc(doc(db, "violations", violationId));
  if (!violation.exists()) return;
  const status = String(violation.data().paymentStatus ?? "").toLowerCase();
  if (status !== "verified") {
    throw new Error(
      "Not paid yet. The impound fee is received by the OIC or Finance in Pending Payments — the vehicle is released automatically once paid."
    );
  }
};
