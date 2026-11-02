/* ------------------------------------------------------------------
   SUPERVISOR — Edit Impound Record

   Opened from the Supervisor's Impounding Log on a vehicle that is
   already Impounded. The Supervisor may correct the record's details
   (UOVR ticket info, driver, vehicle, violations, location, fee,
   turn-over).

   Not editable here:
     - CIN: auto-generated identifier.
     - Status: a vehicle leaves "Impounded" only through payment and
       the release flow (Release Requests → Release Queue).

   A reason is required. The record keeps who last edited it and why,
   and the audit log keeps every changed field with its old and new
   value.
   Styles: ./EditImpoundModal.css
------------------------------------------------------------------ */
import { useMemo, useState } from "react";
import { X, AlertCircle, Lock } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  computeImpoundFee,
  IMPOUND_BASE_FEES,
  IMPOUND_FREE_KM,
  IMPOUND_PER_KM_FEE,
  WEIGHT_CLASS_LABELS,
  weightClassFromVehicleType,
  type VehicleWeightClass,
} from "../../lib/impoundFlag";
import "./EditImpoundModal.css";
import { clientIp } from "../../lib/staffSession";

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */
export type ImpoundRecordData = {
  id: string;
  // Identifiers
  uovrNo?: string;
  aorNo?: string | null;
  cin?: string;
  status?: string;

  // Ticket
  ticketDate?: Timestamp | null;
  ticketTimeStarted?: string | null;
  ticketTimeFinished?: string | null;
  street?: string | null;
  cityMun?: string | null;

  // Driver
  violatorName?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  dateOfBirth?: string;
  address?: string;
  licenseNo?: string;
  contactNo?: string;

  // Vehicle
  plateNo?: string;
  mvFile?: string | null;
  vehicleType?: string;
  color?: string;
  vehicleOwner?: string;
  vehicleOwnerAddress?: string;

  // Violation
  initialViolation?: string;
  impoundViolations?: string[];

  // Apprehension
  apprehendingOfficer?: string;
  deputationNo?: string | null;

  // Confiscation
  dlConfiscated?: boolean;
  plateConfiscated?: boolean;
  towed?: boolean;
  impounded?: boolean;

  // Location + fee
  location?: string;
  distanceKm?: number;
  weightClass?: VehicleWeightClass;
  impoundFee?: number;

  // Turn-over
  clampedBy?: string;
  receivedBy?: string;

  // Meta
  lastEditedBy?: string;
  lastEditedAt?: Timestamp | null;
  lastEditReason?: string;
};

type EditImpoundModalProps = {
  record: ImpoundRecordData;
  currentUserName: string;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  // Ticket
  uovrNo: string;
  aorNo: string;
  ticketDate: string;
  ticketTimeStarted: string;
  ticketTimeFinished: string;
  street: string;
  cityMun: string;

  // Driver
  lastName: string;
  firstName: string;
  middleName: string;
  dateOfBirth: string;
  address: string;
  licenseNo: string;
  contactNo: string;

  // Vehicle
  plateNo: string;
  mvFile: string;
  vehicleType: string;
  color: string;
  vehicleOwner: string;
  vehicleOwnerAddress: string;

  // Violation
  initialViolation: string;
  impoundViolations: string[];

  // Apprehension
  apprehendingOfficer: string;
  deputationNo: string;

  // Location + fee
  location: string;
  distanceKm: string;

  // Turn-over
  clampedBy: string;
  receivedBy: string;
};

const IMPOUND_VIOLATION_OPTIONS = [
  "Driving w/o License",
  "Failure to Show/Carry",
  "Expired OVR/TOP",
  "Invalid Provincial Ticket",
  "Suspicious License / OVR",
  "Improper Use of License (Restriction Code)",
  "Failure to Carry/Show OR / CR",
  "Tampered OR / CR (Pertaining to Date)",
  "Expired OR / Unregistered (No Chassis Number)",
  "Out of Route / Cutting Trip",
  "No Helmet",
  "Obstruction",
  "Illegal Parking",
];

const COLOR_OPTIONS = [
  "Black", "White", "Silver", "Gray", "Red", "Blue", "Green",
  "Yellow", "Orange", "Brown", "Maroon", "Beige", "Gold", "Other",
];

const VEHICLE_TYPE_OPTIONS = [
  { code: "01", label: "PUB" },
  { code: "02", label: "PUJ" },
  { code: "03", label: "CAR" },
  { code: "04", label: "MOTORCYCLE" },
  { code: "05", label: "TAXI" },
  { code: "06", label: "TRAILER" },
  { code: "07", label: "TRICYCLE" },
  { code: "08", label: "VAN" },
  { code: "09", label: "TRUCK" },
  { code: "10", label: "OTHERS" },
];

/** Field names as shown in the audit log. */
const FIELD_LABELS: Record<keyof FormState, string> = {
  uovrNo: "UOVR No.",
  aorNo: "AOR No.",
  ticketDate: "Date of Apprehension",
  ticketTimeStarted: "Time Started",
  ticketTimeFinished: "Time Finished",
  street: "Street",
  cityMun: "City / Municipality",
  lastName: "Last Name",
  firstName: "First Name",
  middleName: "Middle Name",
  dateOfBirth: "Date of Birth",
  address: "Address",
  licenseNo: "License No.",
  contactNo: "Contact No.",
  plateNo: "Plate No.",
  mvFile: "MV File",
  vehicleType: "Vehicle Type",
  color: "Color",
  vehicleOwner: "Vehicle Owner",
  vehicleOwnerAddress: "Vehicle Owner Address",
  initialViolation: "Initial Violation",
  impoundViolations: "Violations Subject for Impounding",
  apprehendingOfficer: "Apprehending Officer",
  deputationNo: "Deputation No.",
  location: "Impound Location",
  distanceKm: "Distance (km)",
  clampedBy: "Turn-over By",
  receivedBy: "Received By",
};

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
const clean = (value: string | undefined | null): string => {
  const v = (value ?? "").trim();
  return v === "—" ? "" : v;
};

function formatPHMobileInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

function timestampToLocalInput(ts: Timestamp | null | undefined): string {
  if (!ts) return "";
  try {
    const d = ts.toDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function formatEditedAt(ts: Timestamp | null | undefined): string {
  if (!ts) return "";
  try {
    return ts.toDate().toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function withSavedOption(options: string[], value: string): string[] {
  return value && !options.includes(value) ? [value, ...options] : options;
}

function formFromRecord(record: ImpoundRecordData): FormState {
  return {
    uovrNo: clean(record.uovrNo),
    aorNo: clean(record.aorNo),
    ticketDate: timestampToLocalInput(record.ticketDate),
    ticketTimeStarted: clean(record.ticketTimeStarted),
    ticketTimeFinished: clean(record.ticketTimeFinished),
    street: clean(record.street),
    cityMun: clean(record.cityMun),

    lastName: clean(record.lastName),
    firstName: clean(record.firstName),
    middleName: clean(record.middleName),
    dateOfBirth: clean(record.dateOfBirth),
    address: clean(record.address),
    licenseNo: clean(record.licenseNo),
    contactNo: clean(record.contactNo),

    plateNo: clean(record.plateNo),
    mvFile: clean(record.mvFile),
    vehicleType: clean(record.vehicleType),
    color: clean(record.color),
    vehicleOwner: clean(record.vehicleOwner),
    vehicleOwnerAddress: clean(record.vehicleOwnerAddress),

    initialViolation: clean(record.initialViolation),
    impoundViolations: record.impoundViolations ?? [],

    apprehendingOfficer: clean(record.apprehendingOfficer),
    deputationNo: clean(record.deputationNo),

    location: clean(record.location),
    distanceKm:
      record.distanceKm != null && Number.isFinite(record.distanceKm)
        ? String(record.distanceKm)
        : "",

    clampedBy: clean(record.clampedBy),
    receivedBy: clean(record.receivedBy),
  };
}

function displayValue(key: keyof FormState, form: FormState): string {
  if (key === "impoundViolations") return form.impoundViolations.join(", ") || "—";
  if (key === "plateNo") return form.plateNo.trim().toUpperCase() || "—";
  return form[key].toString().trim() || "—";
}

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function SupervisorEditImpoundModal({
  record,
  currentUserName,
  onClose,
  onSaved,
}: EditImpoundModalProps) {
  const original = useMemo(() => formFromRecord(record), [record]);
  const [form, setForm] = useState<FormState>(original);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const colorOptions = withSavedOption(COLOR_OPTIONS, original.color);
  const vehicleTypes = useMemo(() => {
    const labels = VEHICLE_TYPE_OPTIONS.map((v) => v.label);
    return original.vehicleType && !labels.includes(original.vehicleType)
      ? [{ code: "—", label: original.vehicleType }, ...VEHICLE_TYPE_OPTIONS]
      : VEHICLE_TYPE_OPTIONS;
  }, [original.vehicleType]);

  /* Live weight class + fee computation */
  const weightClass: VehicleWeightClass = useMemo(
    () => weightClassFromVehicleType(form.vehicleType),
    [form.vehicleType]
  );
  const distanceNum = Number(form.distanceKm) || 0;
  const impoundFee = useMemo(
    () => computeImpoundFee(weightClass, distanceNum),
    [weightClass, distanceNum]
  );
  const baseFee = IMPOUND_BASE_FEES[weightClass];
  const extraKm = Math.max(0, distanceNum - IMPOUND_FREE_KM);
  const extraFee = extraKm * IMPOUND_PER_KM_FEE;

  const changedFields = useMemo(
    () =>
      (Object.keys(FIELD_LABELS) as (keyof FormState)[]).filter(
        (key) => displayValue(key, form) !== displayValue(key, original)
      ),
    [form, original]
  );

  /* Fee changes are separate so they get written too */
  const feeChanged =
    weightClass !== record.weightClass || impoundFee !== (record.impoundFee ?? 0);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleViolationToggle = (violation: string) => {
    setForm((prev) => ({
      ...prev,
      impoundViolations: prev.impoundViolations.includes(violation)
        ? prev.impoundViolations.filter((v) => v !== violation)
        : [...prev.impoundViolations, violation],
    }));
  };

  const handleSubmit = async () => {
    setError("");

    if (changedFields.length === 0 && !feeChanged) {
      setError("Nothing was changed.");
      return;
    }
    if (!form.uovrNo.trim()) {
      setError("UOVR No. is required.");
      return;
    }
    if (!form.plateNo.trim()) {
      setError("Plate number is required.");
      return;
    }
    if (!form.ticketDate) {
      setError("Date of apprehension is required.");
      return;
    }
    const ticketDate = new Date(form.ticketDate);
    if (isNaN(ticketDate.getTime())) {
      setError("Invalid date of apprehension.");
      return;
    }
    if (!reason.trim()) {
      setError("Enter the reason for this edit.");
      return;
    }

    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};

      changedFields.forEach((key) => {
        if (key === "impoundViolations") {
          updates.impoundViolations = form.impoundViolations;
        } else if (key === "ticketDate") {
          updates.ticketDate = Timestamp.fromDate(ticketDate);
        } else if (key === "plateNo") {
          updates.plateNo = form.plateNo.trim().toUpperCase();
        } else {
          updates[key] = displayValue(key, form);
        }
      });

      // Recompose violatorName if any name piece changed
      if (
        changedFields.includes("lastName") ||
        changedFields.includes("firstName") ||
        changedFields.includes("middleName")
      ) {
        const fullName = [form.firstName, form.middleName, form.lastName]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ");
        updates.violatorName = fullName;
      }

      // Write new fee breakdown when weight class or distance changed
      if (feeChanged) {
        updates.weightClass = weightClass;
        updates.distanceKm = distanceNum;
        updates.impoundFee = impoundFee;
        updates.baseFee = baseFee;
        updates.extraKm = extraKm;
        updates.extraFee = extraFee;
      }

      await updateDoc(doc(db, "impoundRecords", record.id), {
        ...updates,
        lastEditedBy: currentUserName,
        lastEditedByRole: "supervisor",
        lastEditedAt: serverTimestamp(),
        lastEditReason: reason.trim(),
        updatedBy: currentUserName,
        updatedAt: serverTimestamp(),
      });

      // Kasabay na violation (Pending Payments) — i-sync ang binago habang
      // hindi pa bayad, para tama ang halagang sisingilin. Best effort.
      try {
        const recordSnap = await getDoc(doc(db, "impoundRecords", record.id));
        const violationId = recordSnap.exists() ? recordSnap.data().sourceViolationId : null;
        if (typeof violationId === "string" && violationId) {
          const violationRef = doc(db, "violations", violationId);
          const violationSnap = await getDoc(violationRef);
          const unpaid =
            violationSnap.exists() &&
            String(violationSnap.data().paymentStatus ?? "").toLowerCase() === "unpaid";
          const sync: Record<string, unknown> = {};
          if ("uovrNo" in updates) sync.uovrNo = updates.uovrNo;
          if ("plateNo" in updates) sync.plateNo = updates.plateNo;
          if ("vehicleType" in updates) sync.vehicleType = updates.vehicleType;
          if ("color" in updates) sync.vehicleColor = updates.color;
          if ("initialViolation" in updates) sync.violationType = updates.initialViolation;
          if ("impoundViolations" in updates) sync.impoundViolations = updates.impoundViolations;
          if ("violatorName" in updates) sync.violatorName = updates.violatorName;
          if ("location" in updates) sync.impoundLocation = updates.location;
          if (feeChanged) {
            sync.impoundFee = updates.impoundFee;
            sync.weightClass = updates.weightClass;
            sync.distanceKm = updates.distanceKm;
          }
          if (unpaid && Object.keys(sync).length > 0) {
            await updateDoc(violationRef, {
              ...sync,
              updatedBy: currentUserName,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (syncErr) {
        console.warn("Linked violation not updated:", syncErr);
      }

      const cin = clean(record.cin) || record.id;
      try {
        await addDoc(collection(db, "auditLogs"), {
          userName: currentUserName,
          userRole: "supervisor",
          action: `edited impound record ${cin} (${[
            ...changedFields.map((key) => FIELD_LABELS[key]),
            ...(feeChanged ? ["Impound Fee"] : []),
          ].join(", ")})`,
          record: cin,
          type: "impound-record-edit",
          metadata: {
            impoundRecordId: record.id,
            cin,
            reason: reason.trim(),
            changes: Object.fromEntries(
              changedFields.map((key) => [
                FIELD_LABELS[key],
                { from: displayValue(key, original), to: displayValue(key, form) },
              ])
            ),
            ...(feeChanged
              ? {
                  feeChange: {
                    from: record.impoundFee ?? 0,
                    to: impoundFee,
                    weightClass,
                    distanceKm: distanceNum,
                  },
                }
              : {}),
          },
          timestamp: serverTimestamp(),
          ipAddress: clientIp(),
        });
      } catch (auditErr) {
        console.warn("Audit log not written:", auditErr);
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error("Edit impound record failed:", err);
      setError(
        (err as { code?: string })?.code === "permission-denied"
          ? "You don't have permission to edit this record. The Firestore rules may not be published yet."
          : (err as Error)?.message || "Failed to save changes."
      );
      setSaving(false);
    }
  };

  const changedClass = (key: keyof FormState) =>
    changedFields.includes(key) ? " is-changed" : "";

  const canSave = changedFields.length > 0 || feeChanged;

  return (
    <div className="sup-impound-edit">
      <div
        className="modal-overlay"
        onClick={saving ? undefined : onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="modal-content modal-content-wide"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h3 className="modal-title">Edit Impound Record</h3>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              disabled={saving}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <p className="modal-subtitle">
            Correct the details of this impounded vehicle. Changes are recorded
            with your name and reason.
          </p>

          <div className="edit-fixed-row">
            <div className="edit-fixed">
              <span className="edit-fixed-label">UOVR No.</span>
              <span className="edit-fixed-value">
                {clean(record.uovrNo) || "—"}
              </span>
            </div>
            <div className="edit-fixed">
              <span className="edit-fixed-label">CIN</span>
              <span className="edit-fixed-value">
                {clean(record.cin) || "—"}
              </span>
            </div>
            <div className="edit-fixed">
              <span className="edit-fixed-label">Status</span>
              <span className="edit-fixed-value">
                {record.status ?? "Impounded"}
              </span>
            </div>
            <div className="edit-fixed-note">
              <Lock size={13} />
              CIN and status can't be changed here. Release goes through
              payment and the release queue.
            </div>
          </div>

          {record.lastEditedBy && (
            <p className="edit-last">
              Last edited by {record.lastEditedBy}
              {record.lastEditedAt
                ? ` · ${formatEditedAt(record.lastEditedAt)}`
                : ""}
              {record.lastEditReason ? ` — “${record.lastEditReason}”` : ""}
            </p>
          )}

          {/* ============ SECTION 1: UOVR ============ */}
          <h4 className="form-section-title">UOVR / Ticket</h4>
          <div className="modal-grid">
            <div className="form-group">
              <label htmlFor="sup-uovrNo">
                UOVR No. <span className="required">*</span>
              </label>
              <input
                id="sup-uovrNo"
                name="uovrNo"
                type="text"
                className={`form-input${changedClass("uovrNo")}`}
                value={form.uovrNo}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    uovrNo: e.target.value.toUpperCase(),
                  }))
                }
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-aorNo">AOR No.</label>
              <input
                id="sup-aorNo"
                name="aorNo"
                type="text"
                className={`form-input${changedClass("aorNo")}`}
                value={form.aorNo}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    aorNo: e.target.value.toUpperCase(),
                  }))
                }
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-ticketDate">
                Date of Apprehension <span className="required">*</span>
              </label>
              <input
                id="sup-ticketDate"
                name="ticketDate"
                type="datetime-local"
                className={`form-input${changedClass("ticketDate")}`}
                value={form.ticketDate}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-ticketTimeStarted">Time Started</label>
              <input
                id="sup-ticketTimeStarted"
                name="ticketTimeStarted"
                type="time"
                className={`form-input${changedClass("ticketTimeStarted")}`}
                value={form.ticketTimeStarted}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-ticketTimeFinished">Time Finished</label>
              <input
                id="sup-ticketTimeFinished"
                name="ticketTimeFinished"
                type="time"
                className={`form-input${changedClass("ticketTimeFinished")}`}
                value={form.ticketTimeFinished}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group form-group-full">
              <label htmlFor="sup-street">Street</label>
              <input
                id="sup-street"
                name="street"
                type="text"
                className={`form-input${changedClass("street")}`}
                value={form.street}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group form-group-full">
              <label htmlFor="sup-cityMun">City / Municipality</label>
              <input
                id="sup-cityMun"
                name="cityMun"
                type="text"
                className={`form-input${changedClass("cityMun")}`}
                value={form.cityMun}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
          </div>

          {/* ============ SECTION 2: DRIVER ============ */}
          <h4 className="form-section-title">Driver Information</h4>
          <div className="modal-grid">
            <div className="form-group">
              <label htmlFor="sup-lastName">Last Name</label>
              <input
                id="sup-lastName"
                name="lastName"
                type="text"
                className={`form-input${changedClass("lastName")}`}
                value={form.lastName}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-firstName">First Name</label>
              <input
                id="sup-firstName"
                name="firstName"
                type="text"
                className={`form-input${changedClass("firstName")}`}
                value={form.firstName}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-middleName">Middle Name</label>
              <input
                id="sup-middleName"
                name="middleName"
                type="text"
                className={`form-input${changedClass("middleName")}`}
                value={form.middleName}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-dateOfBirth">Date of Birth</label>
              <input
                id="sup-dateOfBirth"
                name="dateOfBirth"
                type="date"
                className={`form-input${changedClass("dateOfBirth")}`}
                value={form.dateOfBirth}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group form-group-full">
              <label htmlFor="sup-address">Address</label>
              <input
                id="sup-address"
                name="address"
                type="text"
                className={`form-input${changedClass("address")}`}
                value={form.address}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-licenseNo">License No.</label>
              <input
                id="sup-licenseNo"
                name="licenseNo"
                type="text"
                className={`form-input${changedClass("licenseNo")}`}
                value={form.licenseNo}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    licenseNo: e.target.value.toUpperCase(),
                  }))
                }
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-contactNo">Contact No.</label>
              <input
                id="sup-contactNo"
                name="contactNo"
                type="tel"
                className={`form-input${changedClass("contactNo")}`}
                placeholder="0917 123 4567"
                value={form.contactNo}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    contactNo: formatPHMobileInput(e.target.value),
                  }))
                }
                disabled={saving}
                maxLength={13}
              />
            </div>
          </div>

          {/* ============ SECTION 3: VEHICLE ============ */}
          <h4 className="form-section-title">Vehicle Information</h4>
          <div className="modal-grid">
            <div className="form-group">
              <label htmlFor="sup-plateNo">
                Plate No. <span className="required">*</span>
              </label>
              <input
                id="sup-plateNo"
                name="plateNo"
                type="text"
                className={`form-input${changedClass("plateNo")}`}
                value={form.plateNo}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    plateNo: e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9- ]/g, "")
                      .slice(0, 12),
                  }))
                }
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-mvFile">MV File</label>
              <input
                id="sup-mvFile"
                name="mvFile"
                type="text"
                className={`form-input${changedClass("mvFile")}`}
                value={form.mvFile}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-vehicleType">Vehicle Type</label>
              <select
                id="sup-vehicleType"
                name="vehicleType"
                className={`form-select${changedClass("vehicleType")}`}
                value={form.vehicleType}
                onChange={handleChange}
                disabled={saving}
              >
                <option value="">Select type...</option>
                {vehicleTypes.map((v) => (
                  <option key={`${v.code}-${v.label}`} value={v.label}>
                    {v.code === "—" ? v.label : `${v.code} - ${v.label}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="sup-color">Color</label>
              <select
                id="sup-color"
                name="color"
                className={`form-select${changedClass("color")}`}
                value={form.color}
                onChange={handleChange}
                disabled={saving}
              >
                <option value="">Select color...</option>
                {colorOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group form-group-full">
              <label htmlFor="sup-vehicleOwner">Vehicle Owner</label>
              <input
                id="sup-vehicleOwner"
                name="vehicleOwner"
                type="text"
                className={`form-input${changedClass("vehicleOwner")}`}
                value={form.vehicleOwner}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group form-group-full">
              <label htmlFor="sup-vehicleOwnerAddress">
                Address of Vehicle Owner
              </label>
              <input
                id="sup-vehicleOwnerAddress"
                name="vehicleOwnerAddress"
                type="text"
                className={`form-input${changedClass("vehicleOwnerAddress")}`}
                value={form.vehicleOwnerAddress}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
          </div>

          {/* ============ SECTION 4: VIOLATION ============ */}
          <h4 className="form-section-title">Violation</h4>
          <div className="modal-grid">
            <div className="form-group form-group-full">
              <label htmlFor="sup-initialViolation">Initial Violation</label>
              <input
                id="sup-initialViolation"
                name="initialViolation"
                type="text"
                className={`form-input${changedClass("initialViolation")}`}
                value={form.initialViolation}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
          </div>

          <div className="form-group form-group-full">
            <label>Violations Subject for Impounding</label>
            <div
              className={`checkbox-grid${changedClass("impoundViolations")}`}
            >
              {IMPOUND_VIOLATION_OPTIONS.map((v) => (
                <label key={v} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={form.impoundViolations.includes(v)}
                    onChange={() => handleViolationToggle(v)}
                    disabled={saving}
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ============ SECTION 5: APPREHENSION ============ */}
          <h4 className="form-section-title">Apprehension Details</h4>
          <div className="modal-grid">
            <div className="form-group">
              <label htmlFor="sup-apprehendingOfficer">
                Apprehending Officer
              </label>
              <input
                id="sup-apprehendingOfficer"
                name="apprehendingOfficer"
                type="text"
                className={`form-input${changedClass("apprehendingOfficer")}`}
                value={form.apprehendingOfficer}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-deputationNo">Deputation No.</label>
              <input
                id="sup-deputationNo"
                name="deputationNo"
                type="text"
                className={`form-input${changedClass("deputationNo")}`}
                value={form.deputationNo}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
          </div>

          {/* ============ SECTION 6: LOCATION & FEE ============ */}
          <h4 className="form-section-title">Impound Location &amp; Fee</h4>
          <div className="modal-grid">
            <div className="form-group form-group-full">
              <label htmlFor="sup-location">Impound Location</label>
              <input
                id="sup-location"
                name="location"
                type="text"
                className={`form-input${changedClass("location")}`}
                value={form.location}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-distanceKm">Distance (km)</label>
              <input
                id="sup-distanceKm"
                name="distanceKm"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                className={`form-input${changedClass("distanceKm")}`}
                value={form.distanceKm}
                onChange={handleChange}
                disabled={saving}
              />
              <small className="form-hint">
                Unang {IMPOUND_FREE_KM} km libre, +₱{IMPOUND_PER_KM_FEE}/km
                pagkatapos.
              </small>
            </div>
            <div className="form-group">
              <label>Weight Class</label>
              <div className="read-only-field">
                {form.vehicleType
                  ? WEIGHT_CLASS_LABELS[weightClass]
                  : "Select vehicle type"}
              </div>
            </div>
          </div>

          {/* FEE BREAKDOWN */}
          <div className={`fee-breakdown${feeChanged ? " is-changed" : ""}`}>
            <div className="fee-row">
              <span>Base Fee ({weightClass})</span>
              <strong>₱{baseFee.toLocaleString()}</strong>
            </div>
            <div className="fee-row">
              <span>
                Extra Distance ({extraKm} km × ₱{IMPOUND_PER_KM_FEE})
              </span>
              <strong>₱{extraFee.toLocaleString()}</strong>
            </div>
            <div className="fee-row fee-row-total">
              <span>TOTAL IMPOUND FEE</span>
              <strong>₱{impoundFee.toLocaleString()}</strong>
            </div>
          </div>

          {/* ============ SECTION 7: TURN-OVER ============ */}
          <h4 className="form-section-title">Turn-over</h4>
          <div className="modal-grid">
            <div className="form-group">
              <label htmlFor="sup-clampedBy">Turn-over By</label>
              <input
                id="sup-clampedBy"
                name="clampedBy"
                type="text"
                className={`form-input${changedClass("clampedBy")}`}
                value={form.clampedBy}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sup-receivedBy">Received By</label>
              <input
                id="sup-receivedBy"
                name="receivedBy"
                type="text"
                className={`form-input${changedClass("receivedBy")}`}
                value={form.receivedBy}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
          </div>

          {/* REASON */}
          <h4 className="form-section-title">Reason for Edit</h4>
          <div className="form-group form-group-full">
            <label htmlFor="sup-reason">
              Reason <span className="required">*</span>
            </label>
            <textarea
              id="sup-reason"
              className="form-input form-textarea"
              placeholder="e.g. Wrong plate number encoded; corrected from the paper ticket"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
              disabled={saving}
              rows={2}
            />
          </div>

          {canSave && (
            <p className="edit-summary">
              Changing:{" "}
              {[
                ...changedFields.map((key) => FIELD_LABELS[key]),
                ...(feeChanged ? ["Impound Fee"] : []),
              ].join(", ")}
            </p>
          )}

          {error && (
            <div className="modal-error-box">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSubmit}
              disabled={saving || !canSave}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
