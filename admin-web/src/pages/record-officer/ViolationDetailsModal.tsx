/* ------------------------------------------------------------------
   RECORD OFFICER — Violation details (read-only)

   Opened by clicking a row in All Violations. Shows the whole record:
   vehicle, violation, payment, impound and release. Nothing here can be
   edited — the Record Officer keeps and reviews records.
   Styles: ./ViolationDetailsModal.css
------------------------------------------------------------------ */
import { useEffect } from "react";
import { X, ImageOff } from "lucide-react";
import type { DocumentData } from "firebase/firestore";
import { amountDueFor, graceEndsAt, isPastGrace, overdueFeeFor } from "../../lib/clampFee";
import "./ViolationDetailsModal.css";

type Props = {
  data: DocumentData & { id: string };
  status: string;
  statusClass: string;
  onClose: () => void;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
};

const when = (value: unknown): string => {
  const d = toDate(value);
  return d
    ? d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
};

const text = (value: unknown): string => {
  const s = String(value ?? "").trim();
  return s && s !== "null" && s !== "undefined" && s !== "None" ? s : "—";
};

const peso = (n: number): string =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ENFORCEMENT_LABELS: Record<string, string> = {
  clamped: "Clamped",
  ticketed: "Ticketed",
  impounded: "Impounded (towed)",
};

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`vd-field${wide ? " vd-field-wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function ViolationDetailsModal({ data, status, statusClass, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fine = Number(data.fineAmount) || 0;
  const overdueFee = overdueFeeFor(data);
  const due = amountDueFor(data);
  const paid = Number(data.totalPaid) > 0 ? Number(data.totalPaid) : null;
  const photo = typeof data.photoUrl === "string" && data.photoUrl ? data.photoUrl : null;

  return (
    <div className="vd-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="vd-title">
      <div className="vd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vd-header">
          <div>
            <p className="vd-eyebrow">Violation record</p>
            <h3 id="vd-title" className="vd-title">
              {text(data.cin)}
              <span className={`status-pill ${statusClass}`}>{status}</span>
            </h3>
            <p className="vd-sub">
              {text(data.plateNo)} · {text(data.violationType)}
            </p>
          </div>
          <button type="button" className="vd-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="vd-body">
          <div className="vd-main">
            <section>
              <h4 className="vd-section-title">Vehicle</h4>
              <dl className="vd-grid">
                <Field label="Plate No." value={text(data.plateNo)} />
                <Field label="Type" value={text(data.vehicleType)} />
                <Field label="Make" value={text(data.vehicleMake)} />
                <Field label="Color" value={text(data.vehicleColor ?? data.color)} />
              </dl>
            </section>

            <section>
              <h4 className="vd-section-title">Violation</h4>
              <dl className="vd-grid">
                <Field label="Violation" value={text(data.violationType)} />
                <Field
                  label="Action"
                  value={ENFORCEMENT_LABELS[String(data.enforcementType)] ?? text(data.enforcementType)}
                />
                <Field label="Location" value={text(data.location)} wide />
                <Field label="Enforcer" value={text(data.officer)} />
                <Field label="Recorded" value={when(data.recordedAt)} />
                {data.enforcementType === "clamped" && (
                  <Field
                    label="Grace period ends"
                    value={`${when(graceEndsAt(data))}${isPastGrace(data) ? " (ended)" : ""}`}
                  />
                )}
                <Field label="Owner" value={text(data.violatorName)} />
              </dl>
            </section>

            <section>
              <h4 className="vd-section-title">Payment</h4>
              <dl className="vd-grid">
                <Field label="Amount due" value={peso(due)} />
                <Field
                  label={overdueFee > 0 ? "Clamp fine (replaced)" : "Fine"}
                  value={peso(fine)}
                />
                {overdueFee > 0 && (
                  <Field label="Overdue fee (past 24 hrs)" value={peso(overdueFee)} />
                )}
                <Field label="Payment status" value={text(data.paymentStatus)} />
                <Field label="Method" value={text(data.paymentMethod)} />
                <Field label="Amount paid" value={paid !== null ? peso(paid) : "—"} />
                <Field label="Reference No." value={text(data.referenceNumber ?? data.paymentReference)} />
                <Field label="OR No." value={text(data.orNumber)} />
                <Field label="Paid" value={when(data.paidAt)} />
                <Field label="Verified" value={when(data.verifiedAt)} />
              </dl>
            </section>

            <section>
              <h4 className="vd-section-title">Release</h4>
              <dl className="vd-grid">
                <Field label="Release status" value={text(data.releaseStatus)} />
                <Field label="Release order" value={text(data.releaseOrderId)} />
                <Field label="Released" value={when(data.releasedAt)} />
                <Field label="Released by" value={text(data.releasedBy)} />
              </dl>
            </section>
          </div>

          <aside className="vd-photo">
            <h4 className="vd-section-title">Photo</h4>
            {photo ? (
              <a href={photo} target="_blank" rel="noreferrer" title="Open full size">
                <img src={photo} alt={`Vehicle ${text(data.plateNo)}`} />
              </a>
            ) : (
              <div className="vd-photo-empty">
                <ImageOff size={22} />
                <span>No photo</span>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
