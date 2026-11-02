import { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import {
  addDoc,
  collection,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";

export type PrefillData = {
  sourceViolationId?: string;
  cin?: string;
  plateNo?: string;
  color?: string;
  vehicleType?: string;
  location?: string;
  violatorName?: string;
  contactNo?: string;
  initialViolation?: string;
  clampedAt?: Timestamp | null;
  clampedBy?: string;
};

type AddImpoundModalProps = {
  onClose: () => void;
  onSaved: () => void;
  currentUserName: string;
  prefill?: PrefillData;
};

type FormState = {
  violatorName: string;
  contactNo: string;
  initialViolation: string;
  impoundViolations: string[];
  plateNo: string;
  color: string;
  vehicleType: string;
  place: string;
  ticketDate: string;
  turnOverBy: string;
  receivedBy: string;
  orNumber: string;
  cin: string;
  status: string;
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
  "Black",
  "White",
  "Silver",
  "Gray",
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Orange",
  "Brown",
  "Maroon",
  "Beige",
  "Gold",
  "Other",
];

const VEHICLE_TYPE_OPTIONS = [
  "Sedan",
  "SUV",
  "Hatchback",
  "Pickup",
  "Van",
  "Motorcycle",
  "Truck",
  "Bus",
  "Jeepney",
  "Tricycle",
  "Other",
];

const STATUS_OPTIONS = ["Impounded", "Released"];

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

export default function AddImpoundModal({
  onClose,
  onSaved,
  currentUserName,
  prefill,
}: AddImpoundModalProps) {
  const [form, setForm] = useState<FormState>({
    violatorName: prefill?.violatorName ?? "",
    contactNo: prefill?.contactNo ?? "",
    initialViolation: prefill?.initialViolation ?? "",
    impoundViolations: [],
    plateNo: prefill?.plateNo ?? "",
    color: prefill?.color ?? "",
    vehicleType: prefill?.vehicleType ?? "",
    place: prefill?.location ?? "",
    ticketDate: timestampToLocalInput(prefill?.clampedAt),
    turnOverBy: prefill?.clampedBy ?? "",
    receivedBy: currentUserName || "",
    orNumber: "",
    cin: prefill?.cin ?? "",
    status: "Impounded",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPHMobileInput(e.target.value);
    setForm((prev) => ({ ...prev, contactNo: formatted }));
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

    if (!form.cin.trim()) {
      setError("CIN is required.");
      return;
    }
    if (!form.plateNo.trim()) {
      setError("Plate number is required.");
      return;
    }
    if (!form.ticketDate) {
      setError("Date & time is required.");
      return;
    }

    setSaving(true);
    try {
      const ticketDate = new Date(form.ticketDate);
      if (isNaN(ticketDate.getTime())) {
        throw new Error("Invalid date format.");
      }

      await addDoc(collection(db, "impoundRecords"), {
        sourceViolationId: prefill?.sourceViolationId ?? null,
        cin: form.cin.trim(),
        referenceNumber: null,
        violatorName: form.violatorName.trim() || "—",
        contactNo: form.contactNo.trim() || "—",
        initialViolation: form.initialViolation.trim() || "—",
        impoundViolations: form.impoundViolations,
        plateNo: form.plateNo.trim().toUpperCase(),
        color: form.color.trim() || "—",
        vehicleType: form.vehicleType.trim() || "—",
        location: form.place.trim() || "—",
        clampedAt: Timestamp.fromDate(ticketDate),
        clampedBy: form.turnOverBy.trim() || "—",
        receivedBy: form.receivedBy.trim() || currentUserName,
        orNumber: form.orNumber.trim() || "—",
        status: form.status,
        createdBy: currentUserName,
        createdAt: serverTimestamp(),
        updatedBy: currentUserName,
        updatedAt: serverTimestamp(),
      });

      onSaved();
      onClose();
    } catch (err: any) {
      console.error("Add impound record failed:", err);
      setError(err.message || "Failed to save record.");
      setSaving(false);
    }
  };

  return (
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
          <h3 className="modal-title">Add Impound Record</h3>
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
          Copy the details from the MTPB paper ticket issued on-site.
        </p>

        <h4 className="form-section-title">Driver Information</h4>
        <div className="modal-grid">
          <div className="form-group">
            <label htmlFor="violatorName">Name</label>
            <input
              id="violatorName"
              name="violatorName"
              type="text"
              className="form-input"
              placeholder="Juan Dela Cruz"
              value={form.violatorName}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="contactNo">Contact No.</label>
            <input
              id="contactNo"
              name="contactNo"
              type="tel"
              className="form-input"
              placeholder="0917 123 4567"
              value={form.contactNo}
              onChange={handleContactChange}
              disabled={saving}
              maxLength={13}
            />
          </div>
        </div>

        <h4 className="form-section-title">Violation</h4>
        <div className="modal-grid">
          <div className="form-group form-group-full">
            <label htmlFor="initialViolation">Initial Violation</label>
            <input
              id="initialViolation"
              name="initialViolation"
              type="text"
              className="form-input"
              placeholder="e.g. Illegal Parking"
              value={form.initialViolation}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-group form-group-full">
          <label>Violations Subject for Impounding</label>
          <div className="checkbox-grid">
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
            <label htmlFor="plateNo">
              Plate No. <span className="required">*</span>
            </label>
            <input
              id="plateNo"
              name="plateNo"
              type="text"
              className="form-input"
              placeholder="ABC 1234"
              value={form.plateNo}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="color">Color</label>
            <select
              id="color"
              name="color"
              className="form-select"
              value={form.color}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="">Select color...</option>
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group form-group-full">
            <label htmlFor="vehicleType">Type of Vehicle</label>
            <select
              id="vehicleType"
              name="vehicleType"
              className="form-select"
              value={form.vehicleType}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="">Select type...</option>
              {VEHICLE_TYPE_OPTIONS.map((t) => (
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
            <label htmlFor="place">Place</label>
            <input
              id="place"
              name="place"
              type="text"
              className="form-input"
              placeholder="Recto Ave. Manila"
              value={form.place}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group form-group-full">
            <label htmlFor="ticketDate">
              Date &amp; Time <span className="required">*</span>
            </label>
            <input
              id="ticketDate"
              name="ticketDate"
              type="datetime-local"
              className="form-input"
              value={form.ticketDate}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
        </div>

        <h4 className="form-section-title">Turn-over &amp; Receipt</h4>
        <div className="modal-grid">
          <div className="form-group">
            <label htmlFor="turnOverBy">Turn-over By</label>
            <input
              id="turnOverBy"
              name="turnOverBy"
              type="text"
              className="form-input"
              placeholder="Enforcer name"
              value={form.turnOverBy}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="receivedBy">Received By</label>
            <input
              id="receivedBy"
              name="receivedBy"
              type="text"
              className="form-input"
              placeholder={currentUserName || "Impounding staff"}
              value={form.receivedBy}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group form-group-full">
            <label htmlFor="orNumber">OR Number</label>
            <input
              id="orNumber"
              name="orNumber"
              type="text"
              className="form-input"
              placeholder="e.g. 1234567"
              value={form.orNumber}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
        </div>

        <h4 className="form-section-title">System</h4>
        <div className="modal-grid">
          <div className="form-group">
            <label htmlFor="cin">
              CIN <span className="required">*</span>
            </label>
            <input
              id="cin"
              name="cin"
              type="text"
              className="form-input"
              placeholder="e.g. CLMP-2026-101"
              value={form.cin}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              className="form-select"
              value={form.status}
              onChange={handleChange}
              disabled={saving}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

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
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Record"}
          </button>
        </div>
      </div>
    </div>
  );
}