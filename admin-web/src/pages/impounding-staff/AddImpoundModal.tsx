import { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { syncClampImpound } from "../../lib/impoundFlag";

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
  /** Saved impound details — when opening an existing record */
  impoundViolations?: string[];
  receivedBy?: string;
  orNumber?: string;
  status?: string;
};

type AddImpoundModalProps = {
  onClose: () => void;
  onSaved: () => void;
  currentUserName: string;
  prefill?: PrefillData;
  /**
   * impoundRecords doc na ia-update. Kapag galing sa "Subject to Impound"
   * na row, may record na iyon (ginawa noong na-flag) — ina-update iyon
   * para hindi magdoble ang sasakyan sa log.
   */
  existingRecordId?: string | null;
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

/** Options list plus the prefilled value when the enforcer app used one
 *  that isn't in the list (e.g. "AUV", "MPV"), so it still shows. */
function withPrefillOption(options: string[], value: string | undefined): string[] {
  return value && !options.includes(value) ? [value, ...options] : options;
}

export default function AddImpoundModal({
  onClose,
  onSaved,
  currentUserName,
  prefill,
  existingRecordId,
}: AddImpoundModalProps) {
  const fromClamp = Boolean(prefill?.sourceViolationId || existingRecordId);
  const colorOptions = withPrefillOption(COLOR_OPTIONS, prefill?.color);
  const vehicleTypeOptions = withPrefillOption(VEHICLE_TYPE_OPTIONS, prefill?.vehicleType);

  const [form, setForm] = useState<FormState>({
    violatorName: prefill?.violatorName ?? "",
    contactNo: prefill?.contactNo ?? "",
    initialViolation: prefill?.initialViolation ?? "",
    impoundViolations: prefill?.impoundViolations ?? [],
    plateNo: prefill?.plateNo ?? "",
    color: prefill?.color ?? "",
    vehicleType: prefill?.vehicleType ?? "",
    place: prefill?.location ?? "",
    ticketDate: timestampToLocalInput(prefill?.clampedAt),
    turnOverBy: prefill?.clampedBy ?? "",
    receivedBy: prefill?.receivedBy ?? (currentUserName || ""),
    orNumber: prefill?.orNumber ?? "",
    cin: prefill?.cin ?? "",
    status:
      prefill?.status && STATUS_OPTIONS.includes(prefill.status)
        ? prefill.status
        : "Impounded",
  });

  /**
   * Galing sa clamp record ang Vehicle, Location & Time, Turn-over By at
   * CIN — naka-lock kapag may laman na. Ang walang laman ay puwede pang
   * punan ng staff.
   */
  const [locked] = useState(() => ({
    plateNo: fromClamp && Boolean(prefill?.plateNo),
    color: fromClamp && Boolean(prefill?.color),
    vehicleType: fromClamp && Boolean(prefill?.vehicleType),
    place: fromClamp && Boolean(prefill?.location),
    ticketDate: fromClamp && Boolean(prefill?.clampedAt),
    turnOverBy: fromClamp && Boolean(prefill?.clampedBy),
    cin: fromClamp && Boolean(prefill?.cin),
  }));
  const alreadyRecorded =
    prefill?.status === "Impounded" || prefill?.status === "Released";
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

      const details = {
        sourceViolationId: prefill?.sourceViolationId ?? null,
        cin: form.cin.trim(),
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
        ...(form.status === "Impounded" && prefill?.status !== "Impounded"
          ? { impoundedAt: serverTimestamp() }
          : {}),
        updatedBy: currentUserName,
        updatedAt: serverTimestamp(),
      };

      if (existingRecordId) {
        // Record na ginawa noong na-flag — kumpletuhin at i-update.
        await updateDoc(doc(db, "impoundRecords", existingRecordId), details);
      } else if (prefill?.sourceViolationId) {
        // Galing sa clamp pero wala pang record: doc id = violation id,
        // pareho ng ginagawa ng Clamping Log, para iisa lang ang record.
        await setDoc(doc(db, "impoundRecords", prefill.sourceViolationId), {
          ...details,
          referenceNumber: null,
          createdBy: currentUserName,
          createdAt: serverTimestamp(),
        });
      } else {
        // Paper ticket na walang clamp record sa system.
        await addDoc(collection(db, "impoundRecords"), {
          ...details,
          referenceNumber: null,
          createdBy: currentUserName,
          createdAt: serverTimestamp(),
        });
      }

      // Sabayan ang status sa violation para tama rin ang Clamping Log at
      // Pending Payments. Best effort: kapag hindi pa naka-publish ang
      // bagong Firestore rules, naka-save pa rin ang record.
      if (prefill?.sourceViolationId) {
        try {
          await updateDoc(doc(db, "violations", prefill.sourceViolationId), {
            impoundStatus: form.status,
            updatedAt: serverTimestamp(),
            updatedBy: currentUserName,
          });
        } catch (syncErr) {
          console.warn("Impound status not synced to the violation:", syncErr);
        }
        await syncClampImpound(prefill.sourceViolationId, form.status);
      }

      try {
        await addDoc(collection(db, "auditLogs"), {
          userName: currentUserName,
          userRole: "impounding-staff",
          action: `recorded impound ${form.cin.trim()} (${form.status})`,
          record: form.cin.trim(),
          type: "impound-record",
          metadata: {
            cin: form.cin.trim(),
            plateNo: form.plateNo.trim().toUpperCase(),
            status: form.status,
            sourceViolationId: prefill?.sourceViolationId ?? null,
          },
          timestamp: serverTimestamp(),
        });
      } catch (auditErr) {
        console.warn("Audit log not written:", auditErr);
      }

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
          <h3 className="modal-title">
            {alreadyRecorded ? "Impound Record" : "Add Impound Record"}
          </h3>
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
          {fromClamp
            ? "Fill in the driver and impound details from the paper ticket. Vehicle, place, time and CIN come from the clamp record."
            : "Copy the details from the MTPB paper ticket issued on-site."}
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
              disabled={saving || locked.plateNo}
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
              disabled={saving || locked.color}
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
            <label htmlFor="vehicleType">Type of Vehicle</label>
            <select
              id="vehicleType"
              name="vehicleType"
              className="form-select"
              value={form.vehicleType}
              onChange={handleChange}
              disabled={saving || locked.vehicleType}
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
            <label htmlFor="place">Place</label>
            <input
              id="place"
              name="place"
              type="text"
              className="form-input"
              placeholder="Recto Ave. Manila"
              value={form.place}
              onChange={handleChange}
              disabled={saving || locked.place}
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
              disabled={saving || locked.ticketDate}
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
              disabled={saving || locked.turnOverBy}
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
              disabled={saving || locked.cin}
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