/* ------------------------------------------------------------------
   SUPERVISOR — Edit Impound Record

   Opened from the Supervisor's Impounding Log on a vehicle that is
   already Impounded. The Supervisor may correct the record's details
   (driver, violations, vehicle, place and time, turn-over, OR number).

   Not editable here:
     - CIN: it links the record to the clamp and the violator's QR.
     - Status: a vehicle leaves "Impounded" only through payment and
       the release flow (Release Requests → Release Queue).

   A reason is required. The record keeps who last edited it and why,
   and the audit log keeps every changed field with its old and new value.
   Styles: ./EditImpoundModal.css
------------------------------------------------------------------ */
import { useMemo, useState } from "react";
import { X, AlertCircle, Lock } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import "./EditImpoundModal.css";

/** The impoundRecords document as it is loaded for editing. */
export type ImpoundRecordData = {
  id: string;
  cin?: string;
  status?: string;
  violatorName?: string;
  contactNo?: string;
  initialViolation?: string;
  impoundViolations?: string[];
  plateNo?: string;
  color?: string;
  vehicleType?: string;
  location?: string;
  clampedAt?: Timestamp | null;
  clampedBy?: string;
  receivedBy?: string;
  orNumber?: string;
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
  violatorName: string;
  contactNo: string;
  initialViolation: string;
  impoundViolations: string[];
  plateNo: string;
  color: string;
  vehicleType: string;
  location: string;
  clampedAt: string;
  clampedBy: string;
  receivedBy: string;
  orNumber: string;
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
];

const COLOR_OPTIONS = [
  "Black", "White", "Silver", "Gray", "Red", "Blue", "Green", "Yellow",
  "Orange", "Brown", "Maroon", "Beige", "Gold", "Other",
];

const VEHICLE_TYPE_OPTIONS = [
  "Sedan", "SUV", "Hatchback", "Pickup", "Van", "Motorcycle", "Truck",
  "Bus", "Jeepney", "Tricycle", "Other",
];

/** Field names as shown in the audit log. */
const FIELD_LABELS: Record<keyof FormState, string> = {
  violatorName: "Name",
  contactNo: "Contact No.",
  initialViolation: "Initial Violation",
  impoundViolations: "Violations Subject for Impounding",
  plateNo: "Plate No.",
  color: "Color",
  vehicleType: "Type of Vehicle",
  location: "Place",
  clampedAt: "Date & Time",
  clampedBy: "Turn-over By",
  receivedBy: "Received By",
  orNumber: "OR Number",
};

/** Records store "—" for an empty field; the form shows it as blank. */
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

/** Options plus the saved value when it isn't in the list (e.g. "AUV"). */
function withSavedOption(options: string[], value: string): string[] {
  return value && !options.includes(value) ? [value, ...options] : options;
}

function formFromRecord(record: ImpoundRecordData): FormState {
  return {
    violatorName: clean(record.violatorName),
    contactNo: clean(record.contactNo),
    initialViolation: clean(record.initialViolation),
    impoundViolations: record.impoundViolations ?? [],
    plateNo: clean(record.plateNo),
    color: clean(record.color),
    vehicleType: clean(record.vehicleType),
    location: clean(record.location),
    clampedAt: timestampToLocalInput(record.clampedAt),
    clampedBy: clean(record.clampedBy),
    receivedBy: clean(record.receivedBy),
    orNumber: clean(record.orNumber),
  };
}

/** Same value for the audit log and for change detection. */
function displayValue(key: keyof FormState, form: FormState): string {
  if (key === "impoundViolations") return form.impoundViolations.join(", ") || "—";
  if (key === "plateNo") return form.plateNo.trim().toUpperCase() || "—";
  return form[key].toString().trim() || "—";
}

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
  const vehicleTypeOptions = withSavedOption(VEHICLE_TYPE_OPTIONS, original.vehicleType);

  const changedFields = useMemo(
    () =>
      (Object.keys(FIELD_LABELS) as (keyof FormState)[]).filter(
        (key) => displayValue(key, form) !== displayValue(key, original)
      ),
    [form, original]
  );

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
    if (changedFields.length === 0) {
      setError("Nothing was changed.");
      return;
    }
    if (!form.plateNo.trim()) {
      setError("Plate number is required.");
      return;
    }
    if (!form.clampedAt) {
      setError("Date & time is required.");
      return;
    }
    const clampedAt = new Date(form.clampedAt);
    if (isNaN(clampedAt.getTime())) {
      setError("Invalid date & time.");
      return;
    }
    if (!reason.trim()) {
      setError("Enter the reason for this edit.");
      return;
    }

    setSaving(true);
    try {
      // Only the changed fields are written.
      const updates: Record<string, unknown> = {};
      changedFields.forEach((key) => {
        if (key === "impoundViolations") updates.impoundViolations = form.impoundViolations;
        else if (key === "clampedAt") updates.clampedAt = Timestamp.fromDate(clampedAt);
        else updates[key] = displayValue(key, form);
      });

      await updateDoc(doc(db, "impoundRecords", record.id), {
        ...updates,
        lastEditedBy: currentUserName,
        lastEditedByRole: "supervisor",
        lastEditedAt: serverTimestamp(),
        lastEditReason: reason.trim(),
        updatedBy: currentUserName,
        updatedAt: serverTimestamp(),
      });

      const cin = clean(record.cin) || record.id;
      try {
        await addDoc(collection(db, "auditLogs"), {
          userName: currentUserName,
          userRole: "supervisor",
          action: `edited impound record ${cin} (${changedFields
            .map((key) => FIELD_LABELS[key])
            .join(", ")})`,
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
          },
          timestamp: serverTimestamp(),
        });
      } catch (auditErr) {
        console.warn("Audit log not written:", auditErr);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error("Edit impound record failed:", err);
      setError(
        err?.code === "permission-denied"
          ? "You don't have permission to edit this record. The Firestore rules may not be published yet."
          : err?.message || "Failed to save changes."
      );
      setSaving(false);
    }
  };

  const changedClass = (key: keyof FormState) =>
    changedFields.includes(key) ? " is-changed" : "";

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
              <span className="edit-fixed-label">CIN</span>
              <span className="edit-fixed-value">{clean(record.cin) || "—"}</span>
            </div>
            <div className="edit-fixed">
              <span className="edit-fixed-label">Status</span>
              <span className="edit-fixed-value">{record.status ?? "Impounded"}</span>
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
              {record.lastEditedAt ? ` · ${formatEditedAt(record.lastEditedAt)}` : ""}
              {record.lastEditReason ? ` — “${record.lastEditReason}”` : ""}
            </p>
          )}

          <h4 className="form-section-title">Driver Information</h4>
          <div className="modal-grid">
            <div className="form-group">
              <label htmlFor="sup-violatorName">Name</label>
              <input
                id="sup-violatorName"
                name="violatorName"
                type="text"
                className={`form-input${changedClass("violatorName")}`}
                placeholder="Juan Dela Cruz"
                value={form.violatorName}
                onChange={handleChange}
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

          <h4 className="form-section-title">Violation</h4>
          <div className="modal-grid">
            <div className="form-group form-group-full">
              <label htmlFor="sup-initialViolation">Initial Violation</label>
              <input
                id="sup-initialViolation"
                name="initialViolation"
                type="text"
                className={`form-input${changedClass("initialViolation")}`}
                placeholder="e.g. Illegal Parking"
                value={form.initialViolation}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
          </div>

          <div className="form-group form-group-full">
            <label>Violations Subject for Impounding</label>
            <div className={`checkbox-grid${changedClass("impoundViolations")}`}>
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

          <h4 className="form-section-title">Vehicle</h4>
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
                placeholder="ABC 1234"
                value={form.plateNo}
                onChange={handleChange}
                disabled={saving}
              />
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
              <label htmlFor="sup-vehicleType">Type of Vehicle</label>
              <select
                id="sup-vehicleType"
                name="vehicleType"
                className={`form-select${changedClass("vehicleType")}`}
                value={form.vehicleType}
                onChange={handleChange}
                disabled={saving}
              >
                <option value="">Select type...</option>
                {vehicleTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h4 className="form-section-title">Location &amp; Time</h4>
          <div className="modal-grid">
            <div className="form-group form-group-full">
              <label htmlFor="sup-location">Place</label>
              <input
                id="sup-location"
                name="location"
                type="text"
                className={`form-input${changedClass("location")}`}
                placeholder="Recto Ave. Manila"
                value={form.location}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group form-group-full">
              <label htmlFor="sup-clampedAt">
                Date &amp; Time <span className="required">*</span>
              </label>
              <input
                id="sup-clampedAt"
                name="clampedAt"
                type="datetime-local"
                className={`form-input${changedClass("clampedAt")}`}
                value={form.clampedAt}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
          </div>

          <h4 className="form-section-title">Turn-over &amp; Receipt</h4>
          <div className="modal-grid">
            <div className="form-group">
              <label htmlFor="sup-clampedBy">Turn-over By</label>
              <input
                id="sup-clampedBy"
                name="clampedBy"
                type="text"
                className={`form-input${changedClass("clampedBy")}`}
                placeholder="Enforcer name"
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
                placeholder="Impounding staff"
                value={form.receivedBy}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="form-group form-group-full">
              <label htmlFor="sup-orNumber">OR Number</label>
              <input
                id="sup-orNumber"
                name="orNumber"
                type="text"
                className={`form-input${changedClass("orNumber")}`}
                placeholder="e.g. 1234567"
                value={form.orNumber}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
          </div>

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

          {changedFields.length > 0 && (
            <p className="edit-summary">
              Changing: {changedFields.map((key) => FIELD_LABELS[key]).join(", ")}
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
              disabled={saving || changedFields.length === 0}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
