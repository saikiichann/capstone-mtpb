/* ------------------------------------------------------------------
   IMPOUND RECORDS (UOVR / Blue Ticket) — per MTPB

   Impounding is its own process, separate from clamping:

     1. The Impounding Staff encode the UOVR ticket (Blue Ticket) for a
        vehicle brought to the impound lot.            → "For Payment"
     2. The OIC receives the impounding fee (cash).    → "Released"

   Impounding fee by vehicle class (MTPB; the ordinance does not set a
   per-weight rate, it goes by the kind of vehicle):
     Light  — motorcycles / lightweight vehicles   ₱1,500
     Medium                                         ₱3,500
     Heavy  — trucks, buses                         ₱5,000

   Stored in the `impoundRecords` collection. Older records made from
   clamps (before clamps and impounding were separated) have no UOVR No.;
   they are read with the same shape and show "—" for it.
------------------------------------------------------------------ */
import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase";

// ---------------------------------------------------------------------------
// FEES
// ---------------------------------------------------------------------------
export type VehicleClass = "light" | "medium" | "heavy";

export const VEHICLE_CLASSES: {
  value: VehicleClass;
  label: string;
  hint: string;
  fee: number;
}[] = [
  { value: "light", label: "Light", hint: "Motorcycles and lightweight vehicles", fee: 1500 },
  { value: "medium", label: "Medium", hint: "Medium vehicles", fee: 3500 },
  { value: "heavy", label: "Heavy", hint: "Trucks, buses and other heavy vehicles", fee: 5000 },
];

export const IMPOUND_FEES: Record<VehicleClass, number> = {
  light: 1500,
  medium: 3500,
  heavy: 5000,
};

export const vehicleClassLabel = (value: VehicleClass | null): string =>
  VEHICLE_CLASSES.find((c) => c.value === value)?.label ?? "—";

/**
 * A starting suggestion from the vehicle type; the staff confirm the class
 * on the form (it is what the fee follows).
 */
export const suggestVehicleClass = (vehicleType: string): VehicleClass | null => {
  const t = vehicleType.toLowerCase();
  if (!t) return null;
  if (/(truck|bus|trailer|tanker|dump|heavy)/.test(t)) return "heavy";
  if (/(jeep|van|pickup|pick-up|fx|uv express|l300|medium)/.test(t)) return "medium";
  if (/(motor|tricycle|bike|scooter|sedan|hatch|suv|auv|mpv|car|light)/.test(t)) return "light";
  return null;
};

// ---------------------------------------------------------------------------
// RECORD SHAPE
// ---------------------------------------------------------------------------
export type ImpoundRecordStatus = "For Payment" | "Released";

export type ImpoundRecord = {
  id: string;
  uovrNo: string;
  status: ImpoundRecordStatus;
  vehicleClass: VehicleClass | null;
  impoundFee: number;
  // Driver / owner
  violatorName: string;
  contactNo: string;
  // Violations on the ticket
  violations: string[];
  remarks: string;
  // Vehicle
  plateNo: string;
  vehicleType: string;
  color: string;
  // Apprehension
  location: string;
  apprehendedAt: Timestamp | null;
  apprehendedBy: string;
  receivedBy: string;
  // Encoding
  encodedBy: string;
  encodedAt: Timestamp | null;
  // Payment / release
  referenceNumber: string;
  orNumber: string;
  amountPaid: number;
  cashReceived: number;
  paidAt: Timestamp | null;
  paymentRecordedBy: string;
  releasedAt: Timestamp | null;
  // Supervisor edits
  lastEditedBy: string;
  lastEditedAt: Timestamp | null;
  lastEditReason: string;
  /** Made from a clamp before impounding became its own process */
  legacy: boolean;
};

const text = (value: unknown): string => {
  const s = String(value ?? "").trim();
  return s && s !== "—" && s !== "null" && s !== "undefined" ? s : "";
};

const ts = (value: unknown): Timestamp | null =>
  value instanceof Timestamp ||
  (value && typeof (value as { toDate?: unknown }).toDate === "function")
    ? (value as Timestamp)
    : null;

export const normalizeImpoundRecord = (id: string, data: DocumentData): ImpoundRecord => {
  const storedClass = text(data.vehicleClass) as VehicleClass;
  const vehicleClass: VehicleClass | null = IMPOUND_FEES[storedClass]
    ? storedClass
    : suggestVehicleClass(text(data.vehicleType));
  const storedFee = Number(data.impoundFee);
  const impoundFee =
    Number.isFinite(storedFee) && storedFee > 0
      ? storedFee
      : vehicleClass
        ? IMPOUND_FEES[vehicleClass]
        : 0;
  const status: ImpoundRecordStatus =
    String(data.status ?? "").toLowerCase() === "released" ? "Released" : "For Payment";
  const violations: string[] = Array.isArray(data.violations)
    ? data.violations
    : Array.isArray(data.impoundViolations)
      ? data.impoundViolations
      : [];

  return {
    id,
    uovrNo: text(data.uovrNo),
    status,
    vehicleClass,
    impoundFee,
    violatorName: text(data.violatorName),
    contactNo: text(data.contactNo),
    violations,
    remarks: text(data.remarks ?? data.initialViolation),
    plateNo: text(data.plateNo),
    vehicleType: text(data.vehicleType),
    color: text(data.color),
    location: text(data.location),
    apprehendedAt: ts(data.apprehendedAt) ?? ts(data.clampedAt),
    apprehendedBy: text(data.apprehendedBy ?? data.clampedBy),
    receivedBy: text(data.receivedBy),
    encodedBy: text(data.encodedBy ?? data.createdBy),
    encodedAt: ts(data.encodedAt) ?? ts(data.createdAt),
    referenceNumber: text(data.referenceNumber),
    orNumber: text(data.orNumber),
    amountPaid: Number(data.amountPaid) || 0,
    cashReceived: Number(data.cashReceived) || 0,
    paidAt: ts(data.paidAt),
    paymentRecordedBy: text(data.paymentRecordedBy),
    releasedAt: ts(data.releasedAt),
    lastEditedBy: text(data.lastEditedBy),
    lastEditedAt: ts(data.lastEditedAt),
    lastEditReason: text(data.lastEditReason),
    legacy: !text(data.uovrNo) && Boolean(data.sourceViolationId || data.cin),
  };
};

const millis = (t: Timestamp | null) => {
  try {
    return t ? t.toMillis() : 0;
  } catch {
    return 0;
  }
};

/** Live list of impound records, newest first. */
export function useImpoundRecords(): {
  records: ImpoundRecord[];
  loading: boolean;
  error: string;
} {
  const [records, setRecords] = useState<ImpoundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // No orderBy(): Firestore drops documents missing the ordered field.
    const unsubscribe = onSnapshot(
      collection(db, "impoundRecords"),
      (snap) => {
        setRecords(
          snap.docs
            .map((d) => normalizeImpoundRecord(d.id, d.data()))
            .sort(
              (a, b) =>
                millis(b.encodedAt ?? b.apprehendedAt) - millis(a.encodedAt ?? a.apprehendedAt)
            )
        );
        setError("");
        setLoading(false);
      },
      (err) => {
        console.error("Impound records not loaded:", err);
        setError("Couldn't load the impound records. Check your connection and try again.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { records, loading, error };
}

// ---------------------------------------------------------------------------
// ENCODE / EDIT
// ---------------------------------------------------------------------------
export type UovrForm = {
  uovrNo: string;
  violatorName: string;
  contactNo: string;
  violations: string[];
  remarks: string;
  plateNo: string;
  vehicleType: string;
  color: string;
  vehicleClass: VehicleClass | "";
  location: string;
  apprehendedAt: string; // datetime-local
  apprehendedBy: string;
  receivedBy: string;
};

/** Field values as saved (blank → "—" like the rest of the system). */
const formFields = (form: UovrForm) => {
  const when = new Date(form.apprehendedAt);
  const vehicleClass = form.vehicleClass as VehicleClass;
  return {
    uovrNo: form.uovrNo.trim().toUpperCase(),
    violatorName: form.violatorName.trim() || "—",
    contactNo: form.contactNo.trim() || "—",
    violations: form.violations,
    remarks: form.remarks.trim(),
    plateNo: form.plateNo.trim().toUpperCase(),
    vehicleType: form.vehicleType.trim() || "—",
    color: form.color.trim() || "—",
    vehicleClass,
    impoundFee: IMPOUND_FEES[vehicleClass],
    location: form.location.trim() || "—",
    apprehendedAt: Timestamp.fromDate(when),
    apprehendedBy: form.apprehendedBy.trim() || "—",
    receivedBy: form.receivedBy.trim() || "—",
  };
};

/** Returns an error message, or "" when the form can be saved. */
export const validateUovrForm = (
  form: UovrForm,
  existing: ImpoundRecord[],
  editingId: string | null
): string => {
  const uovr = form.uovrNo.trim().toUpperCase();
  if (!uovr) return "Enter the UOVR No. from the Blue Ticket.";
  if (existing.some((r) => r.id !== editingId && r.uovrNo.toUpperCase() === uovr)) {
    return `UOVR No. ${uovr} is already encoded.`;
  }
  if (!form.plateNo.trim()) return "Enter the plate number.";
  if (!form.vehicleClass) return "Choose the vehicle class — the impounding fee follows it.";
  if (!form.apprehendedAt || isNaN(new Date(form.apprehendedAt).getTime())) {
    return "Enter the date and time on the ticket.";
  }
  return "";
};

export const encodeUovrTicket = async (form: UovrForm, staffName: string): Promise<string> => {
  const fields = formFields(form);
  const ref = await addDoc(collection(db, "impoundRecords"), {
    ...fields,
    status: "For Payment",
    encodedBy: staffName,
    encodedAt: serverTimestamp(),
    createdBy: staffName,
    createdAt: serverTimestamp(),
    updatedBy: staffName,
    updatedAt: serverTimestamp(),
  });
  try {
    await addDoc(collection(db, "auditLogs"), {
      userName: staffName,
      userRole: "impounding-staff",
      action: `encoded UOVR ${fields.uovrNo} (${fields.plateNo}) — ${vehicleClassLabel(
        fields.vehicleClass
      )} vehicle, impounding fee ₱${fields.impoundFee.toLocaleString()}; for OIC payment`,
      record: fields.uovrNo,
      type: "impound-encode",
      metadata: {
        impoundRecordId: ref.id,
        uovrNo: fields.uovrNo,
        plateNo: fields.plateNo,
        vehicleClass: fields.vehicleClass,
        impoundFee: fields.impoundFee,
      },
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Audit log not written:", err);
  }
  return ref.id;
};

/** Impounding Staff correcting a ticket that is still For Payment. */
export const updateUovrTicket = async (
  record: ImpoundRecord,
  form: UovrForm,
  staffName: string
): Promise<void> => {
  const fields = formFields(form);
  await updateDoc(doc(db, "impoundRecords", record.id), {
    ...fields,
    updatedBy: staffName,
    updatedAt: serverTimestamp(),
  });
  try {
    await addDoc(collection(db, "auditLogs"), {
      userName: staffName,
      userRole: "impounding-staff",
      action: `updated UOVR ${fields.uovrNo} (${fields.plateNo})`,
      record: fields.uovrNo,
      type: "impound-update",
      metadata: { impoundRecordId: record.id, uovrNo: fields.uovrNo },
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Audit log not written:", err);
  }
};

/**
 * Supervisor correcting a record's details. The fee and status don't
 * change here once paid; a reason is kept with the record and the audit
 * log lists each changed field.
 */
export const supervisorEditRecord = async (
  record: ImpoundRecord,
  form: UovrForm,
  reason: string,
  supervisorName: string,
  changes: Record<string, { from: string; to: string }>
): Promise<void> => {
  const fields = formFields(form);
  const update: Record<string, unknown> = {
    ...fields,
    lastEditedBy: supervisorName,
    lastEditedByRole: "supervisor",
    lastEditedAt: serverTimestamp(),
    lastEditReason: reason,
    updatedBy: supervisorName,
    updatedAt: serverTimestamp(),
  };
  if (record.status === "Released") {
    // Already paid: what was charged stays as it was.
    delete update.vehicleClass;
    delete update.impoundFee;
  }
  await updateDoc(doc(db, "impoundRecords", record.id), update);
  try {
    await addDoc(collection(db, "auditLogs"), {
      userName: supervisorName,
      userRole: "supervisor",
      action: `edited impound record ${fields.uovrNo || record.id} (${Object.keys(changes).join(", ")})`,
      record: fields.uovrNo || record.id,
      type: "impound-record-edit",
      metadata: { impoundRecordId: record.id, reason, changes },
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Audit log not written:", err);
  }
};

// ---------------------------------------------------------------------------
// PAYMENT (OIC, cash) → Released
// ---------------------------------------------------------------------------
export const recordImpoundPayment = async (params: {
  record: ImpoundRecord;
  cashReceived: number;
  officerName: string;
  amountInWords: string;
}): Promise<{ referenceNumber: string; orNumber: string; paymentId: string }> => {
  const { record, officerName } = params;
  const total = record.impoundFee;
  const cashReceived = Math.max(total, Number(params.cashReceived) || total);
  const cashChange = cashReceived - total;

  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", "paymentReference");
  const orCounterRef = doc(db, "counters", "orNumber");
  const recordRef = doc(db, "impoundRecords", record.id);
  const paymentRef = doc(collection(db, "payments"));
  const auditRef = doc(collection(db, "auditLogs"));

  return runTransaction(db, async (tx) => {
    const current = await tx.get(recordRef);
    if (!current.exists()) throw new Error("This impound record no longer exists.");
    if (String(current.data().status ?? "").toLowerCase() === "released") {
      throw new Error("This impound fee has already been paid.");
    }

    const counterSnap = await tx.get(counterRef);
    const nextRef = (counterSnap.exists() ? Number(counterSnap.data().lastValue ?? 0) : 0) + 1;
    const referenceNumber = `REF-${year}-${String(nextRef).padStart(5, "0")}`;
    const orCounterSnap = await tx.get(orCounterRef);
    const nextOr = (orCounterSnap.exists() ? Number(orCounterSnap.data().lastValue ?? 0) : 0) + 1;
    const orNumber = `OR-${year}-${String(nextOr).padStart(5, "0")}`;

    tx.set(counterRef, { lastValue: nextRef, prefix: "REF", updatedAt: serverTimestamp() }, { merge: true });
    tx.set(orCounterRef, { lastValue: nextOr, prefix: "OR", updatedAt: serverTimestamp() }, { merge: true });

    tx.set(paymentRef, {
      impoundRecordId: record.id,
      uovrNo: record.uovrNo,
      plateNo: record.plateNo,
      violatorName: record.violatorName || null,
      chargeType: "Impound",
      vehicleClass: record.vehicleClass,
      impoundFee: total,
      fineAmount: 0,
      amount: total,
      convenienceFee: 0,
      totalAmount: total,
      cashReceived,
      cashChange,
      amountInWords: params.amountInWords,
      referenceNumber,
      orNumber,
      paymentLocation: "Central",
      method: "Cash",
      // Received by the OIC at the impound lot: settled on the spot.
      status: "Verified",
      verificationStatus: "Verified",
      verifiedBy: officerName,
      verifiedAt: serverTimestamp(),
      recordedBy: officerName,
      recordedByRole: "oic",
      createdAt: serverTimestamp(),
      orIssuedAt: serverTimestamp(),
      orIssuedBy: officerName,
    });

    tx.update(recordRef, {
      status: "Released",
      referenceNumber,
      orNumber,
      amountPaid: total,
      cashReceived,
      cashChange,
      paymentId: paymentRef.id,
      paidAt: serverTimestamp(),
      paymentRecordedBy: officerName,
      releasedAt: serverTimestamp(),
      releasedBy: officerName,
      updatedBy: officerName,
      updatedAt: serverTimestamp(),
    });

    tx.set(auditRef, {
      userName: officerName,
      userRole: "oic",
      action: `received impounding fee for UOVR ${record.uovrNo || record.id} (${record.plateNo}) — ₱${total.toLocaleString()}, OR #${orNumber}; released`,
      record: record.uovrNo || record.id,
      type: "impound-payment",
      metadata: {
        impoundRecordId: record.id,
        uovrNo: record.uovrNo,
        plateNo: record.plateNo,
        vehicleClass: record.vehicleClass,
        impoundFee: total,
        cashReceived,
        cashChange,
        referenceNumber,
        orNumber,
        paymentId: paymentRef.id,
      },
      timestamp: serverTimestamp(),
    });

    return { referenceNumber, orNumber, paymentId: paymentRef.id };
  });
};

// ---------------------------------------------------------------------------
// FORMAT
// ---------------------------------------------------------------------------
export const pesoText = (n: number): string =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatRecordDate = (t: Timestamp | null, withYear = true): string => {
  if (!t) return "—";
  try {
    return t.toDate().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

/** Whole days the vehicle has been in the lot (0 on the first day). */
export const daysInLot = (record: ImpoundRecord, now = Date.now()): number => {
  const from = record.apprehendedAt ?? record.encodedAt;
  if (!from) return 0;
  try {
    return Math.max(0, Math.floor((now - from.toMillis()) / 86400000));
  } catch {
    return 0;
  }
};

export const amountInWords = (num: number): string => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  if (num === 0) return "Zero Pesos Only";
  let n = Math.floor(num);
  let words = "";
  if (n >= 1000) {
    words += `${ones[Math.floor(n / 1000)]} Thousand `;
    n %= 1000;
  }
  if (n >= 100) {
    words += `${ones[Math.floor(n / 100)]} Hundred `;
    n %= 100;
  }
  if (n >= 20) {
    words += `${tens[Math.floor(n / 10)]} `;
    n %= 10;
  } else if (n >= 10) {
    words += `${teens[n - 10]} `;
    n = 0;
  }
  if (n > 0) words += `${ones[n]} `;
  return `${words.trim()} Pesos Only`;
};
