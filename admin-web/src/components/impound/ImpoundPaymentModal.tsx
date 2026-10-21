/* ------------------------------------------------------------------
   OIC receives the impounding fee (cash) for a UOVR record.
   Saving marks the record Released and prints the two-copy slip.
------------------------------------------------------------------ */
import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, X } from "lucide-react";
import CashPaymentSlip from "../CashPaymentSlip";
import {
  amountInWords,
  pesoText,
  recordImpoundPayment,
  vehicleClassLabel,
  type ImpoundRecord,
} from "../../lib/impoundRecords";
import "./impound.css";

type Saved = { referenceNumber: string; orNumber: string; paymentId: string; cashReceived: number };

export default function ImpoundPaymentModal({
  record,
  officerName,
  onClose,
  onPaid,
}: {
  record: ImpoundRecord;
  officerName: string;
  onClose: () => void;
  onPaid: (message: string) => void;
}) {
  const [cashGiven, setCashGiven] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [printing, setPrinting] = useState(false);

  const fee = record.impoundFee;
  const cash = cashGiven.trim() === "" ? fee : Number(cashGiven);
  const change = Number.isFinite(cash) ? cash - fee : NaN;

  const handleSave = async () => {
    setError("");
    if (!fee) {
      setError("This record has no vehicle class yet. Ask the Impounding Staff to set it first.");
      return;
    }
    if (!Number.isFinite(cash) || cash < fee) {
      setError(`Cash received must be at least ${pesoText(fee)}.`);
      return;
    }
    setSaving(true);
    try {
      const result = await recordImpoundPayment({
        record,
        cashReceived: cash,
        officerName,
        amountInWords: amountInWords(fee),
      });
      setSaved({ ...result, cashReceived: cash });
      onPaid(`Impounding fee received for UOVR ${record.uovrNo || record.plateNo} — released. OR ${result.orNumber}.`);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      console.error("Impound payment failed:", err);
      setError(
        code === "permission-denied"
          ? "You don't have permission to record this. The Firestore rules may not be published yet."
          : (err as Error)?.message || "Couldn't record the payment. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  if (printing && saved) {
    return (
      <CashPaymentSlip
        variant="impound"
        feeLabel={`Impounding Fee (${vehicleClassLabel(record.vehicleClass)})`}
        paymentId={saved.paymentId}
        referenceNumber={saved.referenceNumber}
        cin={record.uovrNo || "—"}
        plateNo={record.plateNo}
        amount={fee}
        totalAmount={fee}
        cashReceived={saved.cashReceived}
        orNumber={saved.orNumber}
        recordedBy={officerName}
        createdAt={new Date()}
        onClose={onClose}
        onPrinted={onClose}
      />
    );
  }

  return createPortal(
    <div className="ir-overlay" onClick={saving ? undefined : onClose} role="dialog" aria-modal="true">
      <div className="ir-modal ir-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="ir-modal-head">
          <div>
            <h3 className="ir-modal-title">{saved ? "Payment Recorded" : "Receive Impounding Fee"}</h3>
            <p className="ir-sub">
              UOVR {record.uovrNo || "—"} · {record.plateNo || "—"}
            </p>
          </div>
          <button type="button" className="ir-close" onClick={onClose} disabled={saving} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="ir-modal-body" style={{ paddingBottom: 16 }}>
          <div className="ir-summary">
            {record.violatorName && (
              <div className="ir-summary-row">
                <span>Driver / Owner</span>
                <strong>{record.violatorName}</strong>
              </div>
            )}
            <div className="ir-summary-row">
              <span>Vehicle</span>
              <strong>
                {record.vehicleType || "—"} · {vehicleClassLabel(record.vehicleClass)}
              </strong>
            </div>
            <div className="ir-summary-row ir-summary-total">
              <span>Impounding Fee</span>
              <strong>{pesoText(fee)}</strong>
            </div>
            {saved && (
              <>
                <div className="ir-summary-row">
                  <span>Cash Received</span>
                  <strong>{pesoText(saved.cashReceived)}</strong>
                </div>
                <div className="ir-summary-row">
                  <span>Change</span>
                  <strong>{pesoText(saved.cashReceived - fee)}</strong>
                </div>
                <div className="ir-summary-row">
                  <span>OR No.</span>
                  <strong>{saved.orNumber}</strong>
                </div>
                <div className="ir-summary-row">
                  <span>Reference No.</span>
                  <strong>{saved.referenceNumber}</strong>
                </div>
              </>
            )}
          </div>

          {!saved && (
            <label className="ir-field" style={{ marginTop: 14 }}>
              <span className="ir-label">Cash Received</span>
              <input
                className="ir-input"
                inputMode="decimal"
                value={cashGiven}
                onChange={(e) => {
                  setCashGiven(e.target.value.replace(/[^\d.]/g, ""));
                  if (error) setError("");
                }}
                placeholder={`${fee} (exact amount)`}
                disabled={saving}
              />
              <span className="ir-muted">
                Change: {Number.isFinite(change) && change >= 0 ? pesoText(change) : "—"}
              </span>
            </label>
          )}

          {saved ? (
            <p className="ir-note">
              The vehicle is now <strong>Released</strong>. Print the slip — the violator keeps one copy
              to claim the vehicle at the impound lot.
            </p>
          ) : (
            <p className="ir-note">
              Received by <strong>{officerName}</strong> (OIC). Saving settles the fee and releases the
              vehicle.
            </p>
          )}

          {error && (
            <div className="ir-error-box" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="ir-modal-foot">
          {saved ? (
            <>
              <button type="button" className="ir-btn" onClick={onClose}>
                Done
              </button>
              <button type="button" className="ir-btn ir-btn-primary" onClick={() => setPrinting(true)}>
                Print Slip
              </button>
            </>
          ) : (
            <>
              <button type="button" className="ir-btn" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="ir-btn ir-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : `Receive ${pesoText(fee)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
