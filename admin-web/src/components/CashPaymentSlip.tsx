import { useEffect } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import mtpbLogo from "../assets/mtpb-logo.png";
import "./CashPaymentSlip.css";

/* ------------------------------------------------------------------
   Cash payment slip (80 mm thermal printer).

   Shown after a cash payment is recorded. "Print slip" prints only the
   slip; the violator keeps it. The QR holds a link to the payment's
   random document id (never the REF number, which counts up and could be
   guessed):
     https://mtpb-violators-pwa.vercel.app/r/<paymentId>
   - The verifier scans it with a USB QR scanner into "Scan payment slip"
     on Payment Verification, which reads the id from /r/<id>.
   - Anyone scanning it with a phone opens the violator app's payment
     check page, which shows only REF, amount, date, status, violation
     and plate.
   The REF number is printed small under the QR as the typing backup.
   Design and details: cash-payment-qr-spec.md / cash-payment-slip.html.
------------------------------------------------------------------ */

export const PAYMENT_CHECK_URL = "https://mtpb-violators-pwa.vercel.app/r/";

interface CashPaymentSlipProps {
  paymentId: string;
  referenceNumber: string;
  cin: string;
  plateNo: string;
  amount: number;
  totalAmount: number;
  orNumber: string;
  recordedBy: string;
  createdAt: Date;
  /** Optional: when given and different from the total, Cash Received and Change are shown. */
  cashReceived?: number;
  /** Optional: impound fee included in the total (₱2,000 when impounded). */
  impoundFee?: number;
  /** Optional: "Cash" or "GCash"; shown when given. */
  method?: string;
  onClose: () => void;
  onPrinted: () => void;
}

const peso = (value: number) =>
  `₱ ${new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;

const slipDate = (date: Date) =>
  `${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })} · ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" })}`;

function Slip(props: CashPaymentSlipProps) {
  const { paymentId, referenceNumber, cin, plateNo, amount, totalAmount, orNumber, recordedBy, createdAt, cashReceived, impoundFee, method } = props;
  const showChange = typeof cashReceived === "number" && cashReceived !== totalAmount;

  return (
    <article className="cash-slip" aria-label="Cash payment slip">
      <header className="cash-slip__head">
        <img className="cash-slip__seal" src={mtpbLogo} alt="MTPB seal" />
        <p className="cash-slip__org">MTPB</p>
        <p className="cash-slip__org-full">MANILA TRAFFIC AND PARKING BUREAU</p>
        <p className="cash-slip__title">PAYMENT ACKNOWLEDGMENT</p>
      </header>

      <div className="cash-slip__qr">
        <QRCodeSVG value={`${PAYMENT_CHECK_URL}${encodeURIComponent(paymentId)}`} size={136} level="M" />
      </div>
      <p className="cash-slip__qr-caption">Scan to verify this payment</p>
      <p className="cash-slip__ref">{referenceNumber}</p>
      <p className="cash-slip__violation">
        {cin}
        {plateNo ? ` · ${plateNo}` : ""}
      </p>

      <hr className="cash-slip__rule" />

      <table className="cash-slip__rows">
        <tbody>
          <tr>
            <td>Fine Amount</td>
            <td>{peso(amount)}</td>
          </tr>
          {typeof impoundFee === "number" && impoundFee > 0 && (
            <tr>
              <td>Impound Fee</td>
              <td>{peso(impoundFee)}</td>
            </tr>
          )}
          <tr className="cash-slip__total">
            <td>TOTAL PAID</td>
            <td>{peso(totalAmount)}</td>
          </tr>
          {showChange && (
            <>
              <tr>
                <td>Cash Received</td>
                <td>{peso(cashReceived as number)}</td>
              </tr>
              <tr>
                <td>Change</td>
                <td>{peso((cashReceived as number) - totalAmount)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      <hr className="cash-slip__rule" />

      <table className="cash-slip__rows cash-slip__meta">
        <tbody>
          <tr>
            <td>{slipDate(createdAt)}</td>
            <td>{orNumber ? `OR No. ${orNumber}` : ""}</td>
          </tr>
          {method && (
            <tr>
              <td>Payment Method</td>
              <td>{method}</td>
            </tr>
          )}
          <tr>
            <td>Received by</td>
            <td>{recordedBy}</td>
          </tr>
          <tr>
            <td>Status</td>
            <td>For verification</td>
          </tr>
        </tbody>
      </table>

      <hr className="cash-slip__rule" />

      <p className="cash-slip__footer">
        <strong>Keep this slip.</strong> Present it when claiming your vehicle.
        <br />
        For concerns: mtpbovrdivision@gmail.com
      </p>
    </article>
  );
}

export default function CashPaymentSlip(props: CashPaymentSlipProps) {
  const { onClose, onPrinted } = props;

  // The browser's print dialog has closed (printed or cancelled).
  useEffect(() => {
    const done = () => onPrinted();
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, [onPrinted]);

  return (
    <>
      <div className="cash-slip-overlay" role="dialog" aria-modal="true" aria-labelledby="cash-slip-heading">
        <div className="cash-slip-panel">
          <h2 id="cash-slip-heading" className="cash-slip-panel__title">
            Print payment slip
          </h2>
          <p className="cash-slip-panel__hint">
            Give this slip to the violator. The QR is scanned at Payment Verification.
          </p>
          <div className="cash-slip-panel__preview">
            <Slip {...props} />
          </div>
          <div className="cash-slip-panel__actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn-primary" onClick={() => window.print()}>
              🖨️ Print Slip
            </button>
          </div>
        </div>
      </div>
      {/* Only this copy prints: everything else is hidden while printing. */}
      {createPortal(
        <div className="cash-slip-print">
          <Slip {...props} />
        </div>,
        document.body
      )}
    </>
  );
}
