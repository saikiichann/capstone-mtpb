/* ------------------------------------------------------------------
   UOVR ticket form (Blue Ticket)

   mode "encode"      Impounding Staff encode a new ticket → For Payment
   mode "edit"        Impounding Staff correct a ticket still For Payment
   mode "supervisor"  Supervisor corrects any record; a reason is required.
                      Once paid (Released), the vehicle class / fee stay.

   The impounding fee follows the vehicle class (lib/impoundRecords.ts).
------------------------------------------------------------------ */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, X } from "lucide-react";
import {
  IMPOUND_FEES,
  VEHICLE_CLASSES,
  encodeUovrTicket,
  pesoText,
  suggestVehicleClass,
  supervisorEditRecord,
  updateUovrTicket,
  validateUovrForm,
  type ImpoundRecord,
  type UovrForm,
  type VehicleClass,
} from "../../lib/impoundRecords";
import "./impound.css";

type Props = {
  mode: "encode" | "edit" | "supervisor";
  record?: ImpoundRecord | null;
  /** All records, to keep UOVR numbers unique */
  existing: ImpoundRecord[];
  currentUserName: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

const VIOLATION_OPTIONS = [
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

const VEHICLE_TYPES = [
  "Motorcycle",
  "Tricycle",
  "Sedan",
  "Hatchback",
  "SUV",
  "AUV / MPV",
  "Pickup",
  "Van",
  "Jeepney",
  "Truck",
  "Bus",
  "Other",
];

const COLORS = [
  "Black", "White", "Silver", "Gray", "Red", "Blue", "Green", "Yellow",
  "Orange", "Brown", "Maroon", "Beige", "Gold", "Other",
];

const FIELD_LABELS: Record<keyof UovrForm, string> = {
  uovrNo: "UOVR No.",
  violatorName: "Driver / Owner",
  contactNo: "Contact No.",
  violations: "Violations",
  remarks: "Remarks",
  plateNo: "Plate No.",
  vehicleType: "Type of Vehicle",
  color: "Color",
  vehicleClass: "Vehicle Class",
  location: "Place of Apprehension",
  apprehendedAt: "Date & Time",
  apprehendedBy: "Apprehending Officer",
  receivedBy: "Received By",
};

const toLocalInput = (record: ImpoundRecord | null | undefined): string => {
  const t = record?.apprehendedAt;
  const d = t ? t.toDate() : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
};

const formFromRecord = (record: ImpoundRecord | null | undefined, userName: string): UovrForm => ({
  uovrNo: record?.uovrNo ?? "",
  violatorName: record?.violatorName ?? "",
  contactNo: record?.contactNo ?? "",
  violations: record?.violations ?? [],
  remarks: record?.remarks ?? "",
  plateNo: record?.plateNo ?? "",
  vehicleType: record?.vehicleType ?? "",
  color: record?.color ?? "",
  vehicleClass: record?.vehicleClass ?? "",
  location: record?.location ?? "",
  apprehendedAt: toLocalInput(record),
  apprehendedBy: record?.apprehendedBy ?? "",
  receivedBy: record?.receivedBy ?? (record ? "" : userName),
});

const shown = (key: keyof UovrForm, form: UovrForm): string => {
  if (key === "violations") return form.violations.join(", ") || "—";
  if (key === "uovrNo" || key === "plateNo") return form[key].trim().toUpperCase() || "—";
  return String(form[key]).trim() || "—";
};

const formatContact = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
};

export default function UovrTicketModal({
  mode,
  record,
  existing,
  currentUserName,
  onClose,
  onSaved,
}: Props) {
  const original = useMemo(() => formFromRecord(record, currentUserName), [record, currentUserName]);
  const [form, setForm] = useState<UovrForm>(original);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const paid = record?.status === "Released";
  const classLocked = mode === "supervisor" && paid;
  const fee = form.vehicleClass ? IMPOUND_FEES[form.vehicleClass as VehicleClass] : 0;

  const changed = useMemo(
    () =>
      (Object.keys(FIELD_LABELS) as (keyof UovrForm)[]).filter(
        (k) => shown(k, form) !== shown(k, original)
      ),
    [form, original]
  );

  const set = <K extends keyof UovrForm>(key: K, value: UovrForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError("");
  };

  const setVehicleType = (value: string) => {
    setForm((prev) => ({
      ...prev,
      vehicleType: value,
      // Suggest a class from the type until the staff pick one themselves.
      vehicleClass:
        prev.vehicleClass && prev.vehicleClass !== suggestVehicleClass(prev.vehicleType)
          ? prev.vehicleClass
          : suggestVehicleClass(value) ?? prev.vehicleClass,
    }));
  };

  const toggleViolation = (v: string) =>
    set(
      "violations",
      form.violations.includes(v) ? form.violations.filter((x) => x !== v) : [...form.violations, v]
    );

  const handleSave = async () => {
    const problem = validateUovrForm(form, existing, record?.id ?? null);
    if (problem) {
      setError(problem);
      return;
    }
    if (mode !== "encode" && changed.length === 0) {
      setError("Nothing was changed.");
      return;
    }
    if (mode === "supervisor" && !reason.trim()) {
      setError("Enter the reason for this edit.");
      return;
    }
    setSaving(true);
    try {
      const uovr = form.uovrNo.trim().toUpperCase();
      if (mode === "encode") {
        await encodeUovrTicket(form, currentUserName);
        onSaved(`UOVR ${uovr} encoded — sent to the OIC for payment.`);
      } else if (mode === "edit" && record) {
        await updateUovrTicket(record, form, currentUserName);
        onSaved(`UOVR ${uovr} updated.`);
      } else if (record) {
        await supervisorEditRecord(
          record,
          form,
          reason.trim(),
          currentUserName,
          Object.fromEntries(
            changed.map((k) => [FIELD_LABELS[k], { from: shown(k, original), to: shown(k, form) }])
          )
        );
        onSaved(`Impound record ${uovr || record.plateNo} updated.`);
      }
      onClose();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      console.error("Saving the UOVR ticket failed:", err);
      setError(
        code === "permission-denied"
          ? "You don't have permission to save this. The Firestore rules may not be published yet."
          : (err as Error)?.message || "Couldn't save. Please try again."
      );
      setSaving(false);
    }
  };

  const cls = (key: keyof UovrForm) =>
    mode === "supervisor" && changed.includes(key) ? " ir-changed" : "";

  const title =
    mode === "encode" ? "Encode UOVR Ticket" : mode === "edit" ? "Edit UOVR Ticket" : "Edit Impound Record";

  return createPortal(
    <div className="ir-overlay" onClick={saving ? undefined : onClose} role="dialog" aria-modal="true">
      <div className="ir-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ir-modal-head">
          <div>
            <h3 className="ir-modal-title">{title}</h3>
            <p className="ir-sub">
              {mode === "encode"
                ? "Copy the details from the Blue Ticket. Once saved it goes to the OIC for payment."
                : mode === "supervisor"
                  ? "Correct the details of this impound record. Your name and reason are recorded."
                  : "Correct the ticket while it is waiting for payment."}
            </p>
          </div>
          <button type="button" className="ir-close" onClick={onClose} disabled={saving} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="ir-modal-body">
          <h4 className="ir-section-title">Ticket</h4>
          <div className="ir-grid">
            <label className="ir-field">
              <span className="ir-label">
                UOVR No. <span className="ir-required">*</span>
              </span>
              <input
                className={`ir-input${cls("uovrNo")}`}
                value={form.uovrNo}
                onChange={(e) => set("uovrNo", e.target.value)}
                placeholder="Number on the Blue Ticket"
                disabled={saving}
                autoFocus={mode === "encode"}
              />
            </label>
            <label className="ir-field">
              <span className="ir-label">
                Date &amp; Time <span className="ir-required">*</span>
              </span>
              <input
                type="datetime-local"
                className={`ir-input${cls("apprehendedAt")}`}
                value={form.apprehendedAt}
                onChange={(e) => set("apprehendedAt", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="ir-field ir-field-full">
              <span className="ir-label">Place of Apprehension</span>
              <input
                className={`ir-input${cls("location")}`}
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="e.g. Recto Ave. cor. Rizal Ave., Sta. Cruz"
                disabled={saving}
              />
            </label>
          </div>

          <h4 className="ir-section-title">Driver / Owner</h4>
          <div className="ir-grid">
            <label className="ir-field">
              <span className="ir-label">Name</span>
              <input
                className={`ir-input${cls("violatorName")}`}
                value={form.violatorName}
                onChange={(e) => set("violatorName", e.target.value)}
                placeholder="Juan Dela Cruz"
                disabled={saving}
              />
            </label>
            <label className="ir-field">
              <span className="ir-label">Contact No.</span>
              <input
                type="tel"
                className={`ir-input${cls("contactNo")}`}
                value={form.contactNo}
                onChange={(e) => set("contactNo", formatContact(e.target.value))}
                placeholder="0917 123 4567"
                maxLength={13}
                disabled={saving}
              />
            </label>
          </div>

          <h4 className="ir-section-title">Violations on the ticket</h4>
          <div className={`ir-checks${cls("violations")}`}>
            {VIOLATION_OPTIONS.map((v) => (
              <label key={v} className="ir-check">
                <input
                  type="checkbox"
                  checked={form.violations.includes(v)}
                  onChange={() => toggleViolation(v)}
                  disabled={saving}
                />
                <span>{v}</span>
              </label>
            ))}
          </div>
          <label className="ir-field" style={{ marginTop: 10 }}>
            <span className="ir-label">Remarks</span>
            <textarea
              className={`ir-textarea${cls("remarks")}`}
              value={form.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              placeholder="Other violations or notes written on the ticket"
              disabled={saving}
              rows={2}
            />
          </label>

          <h4 className="ir-section-title">Vehicle</h4>
          <div className="ir-grid">
            <label className="ir-field">
              <span className="ir-label">
                Plate No. <span className="ir-required">*</span>
              </span>
              <input
                className={`ir-input${cls("plateNo")}`}
                value={form.plateNo}
                onChange={(e) => set("plateNo", e.target.value)}
                placeholder="ABC 1234"
                disabled={saving}
              />
            </label>
            <label className="ir-field">
              <span className="ir-label">Type of Vehicle</span>
              <select
                className={`ir-select${cls("vehicleType")}`}
                style={{ width: "100%" }}
                value={form.vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                disabled={saving}
              >
                <option value="">Select type...</option>
                {(form.vehicleType && !VEHICLE_TYPES.includes(form.vehicleType)
                  ? [form.vehicleType, ...VEHICLE_TYPES]
                  : VEHICLE_TYPES
                ).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="ir-field">
              <span className="ir-label">Color</span>
              <select
                className={`ir-select${cls("color")}`}
                style={{ width: "100%" }}
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                disabled={saving}
              >
                <option value="">Select color...</option>
                {(form.color && !COLORS.includes(form.color) ? [form.color, ...COLORS] : COLORS).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ir-field" style={{ marginTop: 12 }}>
            <span className="ir-label">
              Vehicle Class — Impounding Fee <span className="ir-required">*</span>
            </span>
            <div className={`ir-classes${cls("vehicleClass")}`} role="radiogroup" aria-label="Vehicle class">
              {VEHICLE_CLASSES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={form.vehicleClass === c.value}
                  className={`ir-class-option ${form.vehicleClass === c.value ? "is-selected" : ""}`}
                  onClick={() => set("vehicleClass", c.value)}
                  disabled={saving || classLocked}
                >
                  <span className="ir-class-name">{c.label}</span>
                  <span className="ir-class-fee">{pesoText(c.fee)}</span>
                  <span className="ir-class-hint">{c.hint}</span>
                </button>
              ))}
            </div>
            {classLocked && (
              <p className="ir-note">Already paid — the vehicle class and fee can't be changed.</p>
            )}
          </div>

          <h4 className="ir-section-title">Turn-over</h4>
          <div className="ir-grid">
            <label className="ir-field">
              <span className="ir-label">Apprehending Officer</span>
              <input
                className={`ir-input${cls("apprehendedBy")}`}
                value={form.apprehendedBy}
                onChange={(e) => set("apprehendedBy", e.target.value)}
                placeholder="Name on the ticket"
                disabled={saving}
              />
            </label>
            <label className="ir-field">
              <span className="ir-label">Received By</span>
              <input
                className={`ir-input${cls("receivedBy")}`}
                value={form.receivedBy}
                onChange={(e) => set("receivedBy", e.target.value)}
                placeholder="Impounding staff"
                disabled={saving}
              />
            </label>
          </div>

          {mode === "supervisor" && (
            <>
              <h4 className="ir-section-title">Reason for edit</h4>
              <label className="ir-field">
                <span className="ir-label">
                  Reason <span className="ir-required">*</span>
                </span>
                <textarea
                  className="ir-textarea"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder="e.g. Wrong plate number encoded; corrected from the Blue Ticket"
                  disabled={saving}
                  rows={2}
                />
              </label>
              {record?.lastEditedBy && (
                <p className="ir-note">
                  Last edited by {record.lastEditedBy}
                  {record.lastEditReason ? ` — “${record.lastEditReason}”` : ""}
                </p>
              )}
            </>
          )}

          {error && (
            <div className="ir-error-box" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="ir-modal-foot">
          <span className="ir-muted" style={{ marginRight: "auto", alignSelf: "center" }}>
            {fee > 0 ? `Impounding fee: ${pesoText(fee)}` : "Choose the vehicle class"}
          </span>
          <button type="button" className="ir-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="ir-btn ir-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : mode === "encode" ? "Save & Send for Payment" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
