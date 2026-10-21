/* Read-only view of one impound (UOVR) record. */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  daysInLot,
  formatRecordDate,
  pesoText,
  vehicleClassLabel,
  type ImpoundRecord,
} from "../../lib/impoundRecords";
import "./impound.css";

const v = (value: string) => value || "—";

function Item({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "ir-dl-wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function ImpoundRecordDetails({
  record,
  onClose,
}: {
  record: ImpoundRecord;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const released = record.status === "Released";

  return createPortal(
    <div className="ir-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="ir-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ir-modal-head">
          <div>
            <p className="ir-eyebrow">Impound record</p>
            <h3 className="ir-modal-title">
              {record.uovrNo ? `UOVR ${record.uovrNo}` : "No UOVR No."}
              <span className={`ir-pill ${released ? "ir-pill-released" : "ir-pill-for-payment"}`}>
                {record.status}
              </span>
            </h3>
            <p className="ir-sub">
              {v(record.plateNo)} · {vehicleClassLabel(record.vehicleClass)} vehicle ·{" "}
              {pesoText(record.impoundFee)}
            </p>
          </div>
          <button type="button" className="ir-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="ir-modal-body" style={{ paddingBottom: 24 }}>
          {record.legacy && (
            <p className="ir-note" style={{ marginTop: 0 }}>
              Made from a clamp before impounding became its own process (no UOVR No.).
            </p>
          )}

          <h4 className="ir-section-title">Ticket</h4>
          <dl className="ir-dl">
            <Item label="UOVR No." value={v(record.uovrNo)} />
            <Item label="Date & time" value={formatRecordDate(record.apprehendedAt)} />
            <Item label="Days in the lot" value={released ? "—" : String(daysInLot(record))} />
            <Item label="Place of apprehension" value={v(record.location)} wide />
            <Item label="Apprehending officer" value={v(record.apprehendedBy)} />
          </dl>

          <h4 className="ir-section-title">Driver / Owner</h4>
          <dl className="ir-dl">
            <Item label="Name" value={v(record.violatorName)} />
            <Item label="Contact No." value={v(record.contactNo)} />
          </dl>

          <h4 className="ir-section-title">Violations</h4>
          <dl className="ir-dl">
            <Item label="On the ticket" value={record.violations.join(", ") || "—"} wide />
            <Item label="Remarks" value={v(record.remarks)} />
          </dl>

          <h4 className="ir-section-title">Vehicle</h4>
          <dl className="ir-dl">
            <Item label="Plate No." value={v(record.plateNo)} />
            <Item label="Type" value={v(record.vehicleType)} />
            <Item label="Color" value={v(record.color)} />
            <Item label="Class" value={vehicleClassLabel(record.vehicleClass)} />
            <Item label="Impounding fee" value={pesoText(record.impoundFee)} />
          </dl>

          <h4 className="ir-section-title">Encoding</h4>
          <dl className="ir-dl">
            <Item label="Received by" value={v(record.receivedBy)} />
            <Item label="Encoded by" value={v(record.encodedBy)} />
            <Item label="Encoded" value={formatRecordDate(record.encodedAt)} />
            {record.lastEditedBy && (
              <Item
                label="Last edited"
                value={`${record.lastEditedBy}${record.lastEditReason ? ` — “${record.lastEditReason}”` : ""}`}
                wide
              />
            )}
          </dl>

          <h4 className="ir-section-title">Payment &amp; release</h4>
          {released ? (
            <dl className="ir-dl">
              <Item label="Amount paid" value={pesoText(record.amountPaid || record.impoundFee)} />
              <Item label="OR No." value={v(record.orNumber)} />
              <Item label="Reference No." value={v(record.referenceNumber)} />
              <Item label="Paid" value={formatRecordDate(record.paidAt)} />
              <Item label="Received by (OIC)" value={v(record.paymentRecordedBy)} />
              <Item label="Released" value={formatRecordDate(record.releasedAt)} />
            </dl>
          ) : (
            <p className="ir-note" style={{ marginTop: 0 }}>
              Waiting for the impounding fee ({pesoText(record.impoundFee)}) to be paid to the OIC.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
