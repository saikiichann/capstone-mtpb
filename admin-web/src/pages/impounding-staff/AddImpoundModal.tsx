import { useMemo, useState } from "react";
import { X, AlertCircle, Lock } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
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
  type ImpoundStatus,
} from "../../lib/impoundFlag";
import { clientIp } from "../../lib/staffSession";

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */
type AddImpoundModalProps = {
  onClose: () => void;
  onSaved: () => void;
  currentUserName: string;
};

type FormState = {
  // UOVR / Ticket
  uovrNo: string;
  aorNo: string;
  ticketDate: string;      // datetime-local
  ticketTimeStarted: string;
  ticketTimeFinished: string;
  street: string;
  cityMun: string;

  // Driver
  lastName: string;
  firstName: string;
  middleName: string;
  dateOfBirth: string;     // date
  address: string;
  licenseNo: string;

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

  // Confiscation flags
  dlConfiscated: boolean;
  plateConfiscated: boolean;
  towed: boolean;
  impounded: boolean;

  // Impound location + fee
  impoundLocation: string;
  distanceKm: string;

  // Turn-over
  receivedBy: string;

  // System
  status: ImpoundStatus;
};

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const VEHICLE_TYPES = [
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

const COLOR_OPTIONS = [
  "Black", "White", "Silver", "Gray", "Red", "Blue", "Green",
  "Yellow", "Orange", "Brown", "Maroon", "Beige", "Gold", "Other",
];

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

const STATUS_OPTIONS: ImpoundStatus[] = ["Impounded", "Released"];

const UOVR_REGEX = /^[A-Z]{1,3}-\d{6,8}$/;

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
function formatPlateInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9- ]/g, "").slice(0, 12);
}

/** Generate CIN: IMP-YYYY-#### */
async function generateImpoundCIN(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `IMP-${year}-`;

  const q = query(
    collection(db, "violations"),
    where("cin", ">=", `${prefix}0000`),
    where("cin", "<=", `${prefix}9999`),
    limit(1000)
  );
  const snap = await getDocs(q);

  let maxSeq = 0;
  snap.docs.forEach((d) => {
    const cin = String(d.data().cin ?? "");
    const m = cin.match(/^IMP-\d{4}-(\d{4})$/);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  });

  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function AddImpoundModal({
  onClose,
  onSaved,
  currentUserName,
}: AddImpoundModalProps) {
  const [form, setForm] = useState<FormState>({
    uovrNo: "",
    aorNo: "",
    ticketDate: "",
    ticketTimeStarted: "",
    ticketTimeFinished: "",
    street: "",
    cityMun: "",

    lastName: "",
    firstName: "",
    middleName: "",
    dateOfBirth: "",
    address: "",
    licenseNo: "",

    plateNo: "",
    mvFile: "",
    vehicleType: "",
    color: "",
    vehicleOwner: "",
    vehicleOwnerAddress: "",

    initialViolation: "",
    impoundViolations: [],

    apprehendingOfficer: "",
    deputationNo: "",

    dlConfiscated: false,
    plateConfiscated: false,
    towed: true,
    impounded: true,

    impoundLocation: "",
    distanceKm: "",

    receivedBy: currentUserName || "",

    status: "Impounded",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uovrWarning, setUovrWarning] = useState("");

  /* ---------------- DERIVED ---------------- */
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

  /* ---------------- HANDLERS ---------------- */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setForm((prev) => ({ ...prev, [name]: checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
    if (error) setError("");
    if (name === "uovrNo") setUovrWarning("");
  };

  const handleViolationToggle = (violation: string) => {
    setForm((prev) => ({
      ...prev,
      impoundViolations: prev.impoundViolations.includes(violation)
        ? prev.impoundViolations.filter((v) => v !== violation)
        : [...prev.impoundViolations, violation],
    }));
  };

  /** Live UOVR duplicate check kapag umalis sa field. */
  const checkUovrDuplicate = async () => {
    const uovr = form.uovrNo.trim().toUpperCase();
    if (!uovr) {
      setUovrWarning("");
      return;
    }
    try {
      const snap = await getDocs(
        query(
          collection(db, "impoundRecords"),
          where("uovrNo", "==", uovr),
          limit(1)
        )
      );
      if (!snap.empty) {
        setUovrWarning(`UOVR "${uovr}" already exists in the system.`);
      } else {
        setUovrWarning("");
      }
    } catch (err) {
      console.warn("UOVR duplicate check failed:", err);
    }
  };

  /* ---------------- VALIDATION ---------------- */
  const validate = (): string | null => {
    if (!form.uovrNo.trim()) return "UOVR No. is required.";
    if (!UOVR_REGEX.test(form.uovrNo.trim().toUpperCase()))
      return "UOVR No. format is invalid (e.g., ML-0267990).";
    if (!form.ticketDate) return "Date of apprehension is required.";
    if (!form.street.trim()) return "Street is required.";
    if (!form.cityMun.trim()) return "City/Municipality is required.";

    if (!form.lastName.trim()) return "Last Name is required.";
    if (!form.firstName.trim()) return "First Name is required.";
    if (!form.dateOfBirth) return "Date of Birth is required.";
    if (!form.address.trim()) return "Address is required.";
    if (!form.licenseNo.trim()) return "License Number is required.";

    if (!form.plateNo.trim()) return "Plate Number is required.";
    if (!form.vehicleType) return "Vehicle Type is required.";
    if (!form.vehicleOwner.trim()) return "Vehicle Owner is required.";
    if (!form.vehicleOwnerAddress.trim())
      return "Vehicle Owner Address is required.";

    if (!form.initialViolation.trim()) return "Initial Violation is required.";
    if (form.impoundViolations.length === 0)
      return "Select at least one violation subject for impounding.";

    if (!form.apprehendingOfficer.trim())
      return "Apprehending Officer is required.";

    if (!form.impoundLocation.trim()) return "Impound Location is required.";
    if (!form.distanceKm || distanceNum < 0)
      return "Distance (km) is required.";

    if (!form.receivedBy.trim()) return "Received By is required.";

    return null;
  };

  /* ---------------- SUBMIT ---------------- */
  const handleSubmit = async () => {
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const uovr = form.uovrNo.trim().toUpperCase();

      // Duplicate check (final)
      const dupSnap = await getDocs(
        query(
          collection(db, "impoundRecords"),
          where("uovrNo", "==", uovr),
          limit(1)
        )
      );
      if (!dupSnap.empty) {
        setError(`UOVR "${uovr}" already exists. Cannot save duplicate.`);
        setSaving(false);
        return;
      }

      // Auto-generate CIN
      const cin = await generateImpoundCIN();

      // Full name
      const fullName = [form.firstName, form.middleName, form.lastName]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");

      // Ticket datetime
      let ticketDate: Timestamp | null = null;
      if (form.ticketDate) {
        const d = new Date(form.ticketDate);
        if (!isNaN(d.getTime())) ticketDate = Timestamp.fromDate(d);
      }

      const docData = {
        // Identifiers
        uovrNo: uovr,
        cin,
        referenceNumber: null,

        // Ticket
        aorNo: form.aorNo.trim() || null,
        ticketDate,
        ticketTimeStarted: form.ticketTimeStarted || null,
        ticketTimeFinished: form.ticketTimeFinished || null,
        street: form.street.trim(),
        cityMun: form.cityMun.trim(),

        // Driver
        violatorName: fullName,
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || null,
        dateOfBirth: form.dateOfBirth,
        contactNo: null, // UOVR doesn't have contact; pwede i-add sa Edit
        address: form.address.trim(),
        licenseNo: form.licenseNo.trim().toUpperCase(),

        // Vehicle
        plateNo: formatPlateInput(form.plateNo),
        mvFile: form.mvFile.trim() || null,
        vehicleType: form.vehicleType,
        color: form.color.trim() || null,
        vehicleOwner: form.vehicleOwner.trim(),
        vehicleOwnerAddress: form.vehicleOwnerAddress.trim(),

        // Violation
        initialViolation: form.initialViolation.trim(),
        impoundViolations: form.impoundViolations,

        // Apprehension
        apprehendingOfficer: form.apprehendingOfficer.trim(),
        deputationNo: form.deputationNo.trim() || null,

        // Confiscation
        dlConfiscated: form.dlConfiscated,
        plateConfiscated: form.plateConfiscated,
        towed: form.towed,
        impounded: form.impounded,

        // Location + fee
        location: form.impoundLocation.trim(),
        distanceKm: distanceNum,
        weightClass,
        impoundFee,
        baseFee,
        extraKm,
        extraFee,

        // Petsa ng impound — binabasa ito ng Impounding Log / Active
        // Impounding / Homepage (dati walang laman, kaya "—" ang petsa).
        clampedAt: ticketDate ?? serverTimestamp(),

        // Turn-over
        clampedBy: form.apprehendingOfficer.trim(),
        receivedBy: form.receivedBy.trim(),

        // Status
        status: form.status,

        // Meta
        createdBy: currentUserName,
        createdAt: serverTimestamp(),
        updatedBy: currentUserName,
        updatedAt: serverTimestamp(),
      };

      // Impounded → may kasabay na violation (Unpaid) para lumabas sa
      // Pending Payments. Isang batch: sabay na masusulat o wala pareho.
      const batch = writeBatch(db);
      const recordRef = doc(collection(db, "impoundRecords"));
      if (form.status === "Impounded") {
        const violationRef = doc(collection(db, "violations"));
        const place = [form.street.trim(), form.cityMun.trim()].filter(Boolean).join(", ");
        batch.set(violationRef, {
          cin,
          uovrNo: uovr,
          plateNo: docData.plateNo,
          vehicleType: form.vehicleType,
          vehicleColor: docData.color,
          violationType: docData.initialViolation,
          impoundViolations: form.impoundViolations,
          enforcementType: "impounded",
          clampId: null,

          // Lugar ng huli (ticket) at impound lot
          location: place || docData.location,
          impoundLocation: docData.location,
          sectorId: "sector-3",

          officer: docData.apprehendingOfficer,
          fineAmount: 0,

          // Violator — "Registered" kapag active ang plate (lib/registeredOwners.ts)
          violatorUid: null,
          guestId: `guest_${docData.plateNo}`,
          violatorName: fullName || null,

          // Impound
          impoundStatus: "Impounded",
          impoundFee,
          weightClass,
          distanceKm: distanceNum,
          impoundRecordId: recordRef.id,

          recordedAt: ticketDate ?? serverTimestamp(),
          paymentStatus: "Unpaid",
          releaseStatus: "Pending",
          createdBy: currentUserName,
          createdAt: serverTimestamp(),
        });
        batch.set(recordRef, { ...docData, sourceViolationId: violationRef.id });
      } else {
        batch.set(recordRef, docData);
      }
      await batch.commit();

      // Audit log (best effort)
      try {
        await addDoc(collection(db, "auditLogs"), {
          userName: currentUserName,
          userRole: "impounding-staff",
          action: `recorded impound ${cin} (UOVR ${uovr}, fee ₱${impoundFee.toLocaleString()})`,
          record: cin,
          type: "impound-record",
          metadata: {
            uovrNo: uovr,
            cin,
            plateNo: docData.plateNo,
            weightClass,
            distanceKm: distanceNum,
            impoundFee,
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
      console.error("Add impound record failed:", err);
      setError((err as Error)?.message || "Failed to save record.");
      setSaving(false);
    }
  };

  /* ---------------- RENDER ---------------- */
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
          Copy the details from the MTPB UOVR (Blue Ticket). All fields are
          required unless stated otherwise.
        </p>

        {/* ============ SECTION 1: UOVR ============ */}
        <h4 className="form-section-title">UOVR / Ticket</h4>
        <div className="modal-grid">
          <div className="form-group">
            <label htmlFor="uovrNo">
              UOVR No. <span className="required">*</span>
            </label>
            <input
              id="uovrNo"
              name="uovrNo"
              type="text"
              className="form-input"
              placeholder="ML-0267990"
              value={form.uovrNo}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  uovrNo: e.target.value.toUpperCase(),
                }))
              }
              onBlur={checkUovrDuplicate}
              disabled={saving}
            />
            {uovrWarning && (
              <small className="form-error">{uovrWarning}</small>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="aorNo">
              AOR No. <span className="required">*</span>
            </label>
            <input
              id="aorNo"
              name="aorNo"
              type="text"
              className="form-input"
              placeholder="AOR-3901"
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
            <label htmlFor="ticketDate">
              Date of Apprehension <span className="required">*</span>
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
          <div className="form-group">
            <label htmlFor="ticketTimeStarted">
              Time Started <span className="required">*</span>
            </label>
            <input
              id="ticketTimeStarted"
              name="ticketTimeStarted"
              type="time"
              className="form-input"
              value={form.ticketTimeStarted}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="ticketTimeFinished">
              Time Finished <span className="required">*</span>
            </label>
            <input
              id="ticketTimeFinished"
              name="ticketTimeFinished"
              type="time"
              className="form-input"
              value={form.ticketTimeFinished}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group form-group-full">
            <label htmlFor="street">
              Street <span className="required">*</span>
            </label>
            <input
              id="street"
              name="street"
              type="text"
              className="form-input"
              placeholder="Cavite St"
              value={form.street}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group form-group-full">
            <label htmlFor="cityMun">
              City / Municipality <span className="required">*</span>
            </label>
            <input
              id="cityMun"
              name="cityMun"
              type="text"
              className="form-input"
              placeholder="Manila"
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
            <label htmlFor="lastName">
              Last Name <span className="required">*</span>
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              className="form-input"
              placeholder="DIZON"
              value={form.lastName}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="firstName">
              First Name <span className="required">*</span>
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              className="form-input"
              placeholder="FRANCISCO JR"
              value={form.firstName}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="middleName">
              Middle Name <span className="required">*</span>
            </label>
            <input
              id="middleName"
              name="middleName"
              type="text"
              className="form-input"
              placeholder="MENDOZA"
              value={form.middleName}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="dateOfBirth">
              Date of Birth <span className="required">*</span>
            </label>
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              className="form-input"
              value={form.dateOfBirth}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group form-group-full">
            <label htmlFor="address">
              Address <span className="required">*</span>
            </label>
            <input
              id="address"
              name="address"
              type="text"
              className="form-input"
              placeholder="925 K-... St. Sampaloc, Manila"
              value={form.address}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group form-group-full">
            <label htmlFor="licenseNo">
              License Number <span className="required">*</span>
            </label>
            <input
              id="licenseNo"
              name="licenseNo"
              type="text"
              className="form-input"
              placeholder="N04-19-025074"
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
        </div>

        {/* ============ SECTION 3: VEHICLE ============ */}
        <h4 className="form-section-title">Vehicle Information</h4>
        <div className="modal-grid">
          <div className="form-group">
            <label htmlFor="plateNo">
              Plate Number <span className="required">*</span>
            </label>
            <input
              id="plateNo"
              name="plateNo"
              type="text"
              className="form-input"
              placeholder="FOR-R56"
              value={form.plateNo}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  plateNo: formatPlateInput(e.target.value),
                }))
              }
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="mvFile">
              MV File <span className="required">*</span>
            </label>
            <input
              id="mvFile"
              name="mvFile"
              type="text"
              className="form-input"
              placeholder="MV File No."
              value={form.mvFile}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="vehicleType">
              Vehicle Type <span className="required">*</span>
            </label>
            <select
              id="vehicleType"
              name="vehicleType"
              className="form-select"
              value={form.vehicleType}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="">Select type...</option>
              {VEHICLE_TYPES.map((v) => (
                <option key={v.code} value={v.label}>
                  {v.code} - {v.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="color">
              Color <span className="required">*</span>
            </label>
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
            <label htmlFor="vehicleOwner">
              Vehicle Owner <span className="required">*</span>
            </label>
            <input
              id="vehicleOwner"
              name="vehicleOwner"
              type="text"
              className="form-input"
              placeholder="Full name of owner"
              value={form.vehicleOwner}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group form-group-full">
            <label htmlFor="vehicleOwnerAddress">
              Address of Vehicle Owner <span className="required">*</span>
            </label>
            <input
              id="vehicleOwnerAddress"
              name="vehicleOwnerAddress"
              type="text"
              className="form-input"
              placeholder="Complete address"
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
            <label htmlFor="initialViolation">
              Initial Violation <span className="required">*</span>
            </label>
            <input
              id="initialViolation"
              name="initialViolation"
              type="text"
              className="form-input"
              placeholder="e.g. No Helmet"
              value={form.initialViolation}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-group form-group-full">
          <label>
            Violations Subject for Impounding <span className="required">*</span>
          </label>
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

        {/* ============ SECTION 5: APPREHENSION ============ */}
        <h4 className="form-section-title">Apprehension Details</h4>
        <div className="modal-grid">
          <div className="form-group">
            <label htmlFor="apprehendingOfficer">
              Apprehending Officer <span className="required">*</span>
            </label>
            <input
              id="apprehendingOfficer"
              name="apprehendingOfficer"
              type="text"
              className="form-input"
              placeholder="MC PAMINTUAN, MARY GRACE V."
              value={form.apprehendingOfficer}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="deputationNo">
              Deputation No. <span className="required">*</span>
            </label>
            <input
              id="deputationNo"
              name="deputationNo"
              type="text"
              className="form-input"
              placeholder="DEPT 13093"
              value={form.deputationNo}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-group form-group-full">
          <label>Confiscation</label>
          <div className="checkbox-grid">
            <label className="checkbox-item">
              <input
                type="checkbox"
                name="dlConfiscated"
                checked={form.dlConfiscated}
                onChange={handleChange}
                disabled={saving}
              />
              <span>DL Confiscated</span>
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                name="plateConfiscated"
                checked={form.plateConfiscated}
                onChange={handleChange}
                disabled={saving}
              />
              <span>Plate Confiscated</span>
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                name="towed"
                checked={form.towed}
                onChange={handleChange}
                disabled={saving}
              />
              <span>Towed</span>
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                name="impounded"
                checked={form.impounded}
                onChange={handleChange}
                disabled={saving}
              />
              <span>Impounded</span>
            </label>
          </div>
        </div>

        {/* ============ SECTION 6: LOCATION & FEE ============ */}
        <h4 className="form-section-title">Impound Location &amp; Fee</h4>
        <div className="modal-grid">
          <div className="form-group form-group-full">
            <label htmlFor="impoundLocation">
              Impound Location <span className="required">*</span>
            </label>
            <input
              id="impoundLocation"
              name="impoundLocation"
              type="text"
              className="form-input"
              placeholder="MTPB Impound Yard, Manila"
              value={form.impoundLocation}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="distanceKm">
              Distance (km) <span className="required">*</span>
            </label>
            <input
              id="distanceKm"
              name="distanceKm"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              className="form-input"
              placeholder="8"
              value={form.distanceKm}
              onChange={handleChange}
              disabled={saving}
            />
            <small className="form-hint">
              Unang {IMPOUND_FREE_KM} km libre, +₱{IMPOUND_PER_KM_FEE}/km pagkatapos.
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
        <div className="fee-breakdown">
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
          <div className="form-group form-group-full">
            <label htmlFor="receivedBy">
              Received By <span className="required">*</span>
            </label>
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
        </div>

        {/* ============ SECTION 8: SYSTEM ============ */}
        <h4 className="form-section-title">System</h4>
        <div className="modal-grid">
          <div className="form-group">
            <label>CIN</label>
            <div className="read-only-field">
              <Lock size={12} style={{ display: "inline", marginRight: 6 }} />
              Auto-generated (IMP-YYYY-####)
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="status">
              Status <span className="required">*</span>
            </label>
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

        {/* ERROR */}
        {error && (
          <div className="modal-error-box">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* FOOTER */}
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
