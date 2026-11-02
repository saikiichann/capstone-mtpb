import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import "./CashPaymentSlip.css";
import mtpbLogo from "../assets/mtpb-logo.png";

type CashPaymentSlipProps = {
  paymentId: string;
  referenceNumber: string;
  cin: string;
  plateNo: string;
  amount: number;
  totalAmount: number;
  orNumber: string;
  recordedBy: string;
  createdAt: Date;
  onClose: () => void;
  onPrinted: () => void;
};

export default function CashPaymentSlip({
  paymentId,
  referenceNumber,
  cin,
  plateNo,
  amount,
  totalAmount,
  orNumber,
  recordedBy,
  createdAt,
  onClose,
  onPrinted,
}: CashPaymentSlipProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [qrReady, setQrReady] = useState(false);

  const verifyUrl = `https://mtpb-violators-pwa.vercel.app/r/${paymentId}`;

  /* Auto — cash received = amount due, change = 0 */
  const displayCashReceived = totalAmount;
  const displayChange = 0;

  /* Generate QR code offline (browser) */
  useEffect(() => {
    if (!qrCanvasRef.current) return;
    QRCode.toCanvas(
      qrCanvasRef.current,
      verifyUrl,
      {
        width: 200,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#FFFFFF" },
      },
      (err) => {
        if (err) {
          console.error("QR generation failed:", err);
        } else {
          setQrReady(true);
        }
      }
    );
  }, [verifyUrl]);

  const handlePrint = () => {
    window.print();
    setTimeout(() => {
      onPrinted();
    }, 500);
  };

  return (
    <div className="cash-slip-overlay">
      {/* ACTION BUTTONS (hindi naka-print) */}
      <div className="cash-slip-actions no-print">
        <button
          className="btn-primary"
          onClick={handlePrint}
          disabled={!qrReady}
        >
          🖨️ Print Slip
        </button>
        <button className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>

      {/* PRINTABLE SLIP — 80mm thermal */}
      <div className="cash-slip">
        {/* SEAL / LOGO */}
        <div className="slip-seal">
          <img src={mtpbLogo} alt="MTPB Seal" />
        </div>

        {/* HEADER */}
        <div className="slip-header">
          <p className="slip-bureau-title">MTPB</p>
          <p className="slip-bureau">MANILA TRAFFIC AND PARKING BUREAU</p>
          <p className="slip-title">PAYMENT ACKNOWLEDGMENT</p>
        </div>

        {/* QR CODE */}
        <div className="slip-qr">
          <canvas ref={qrCanvasRef} />
          <p className="slip-qr-caption">Scan to verify this payment</p>
          <p className="slip-qr-ref">{referenceNumber}</p>
          <p className="slip-cin-plate">
            {cin} · {plateNo}
          </p>
        </div>

        {/* DETAILS */}
        <div className="slip-details">
          <div className="slip-row">
            <span>Fine Amount</span>
            <strong>₱{amount.toFixed(2)}</strong>
          </div>
          <div className="slip-row slip-row-total">
            <span>TOTAL DUE</span>
            <strong>₱{totalAmount.toFixed(2)}</strong>
          </div>

          <div className="slip-divider" />

          <div className="slip-row">
            <span>Cash Received</span>
            <strong>₱{displayCashReceived.toFixed(2)}</strong>
          </div>
          <div className="slip-row">
            <span>Change</span>
            <strong>₱{displayChange.toFixed(2)}</strong>
          </div>

          <div className="slip-divider" />

          <div className="slip-row">
            <span>Date &amp; Time</span>
            <strong>
              {createdAt.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </strong>
          </div>
          <div className="slip-row">
            <span>OR No.</span>
            <strong>{orNumber}</strong>
          </div>
          <div className="slip-row">
            <span>Received by</span>
            <strong>{recordedBy}</strong>
          </div>
        </div>

        {/* STATUS */}
        <div className="slip-status">
          <p>
            Status: <strong>For OIC verification</strong>
          </p>
        </div>

        {/* FOOTER */}
        <div className="slip-footer">
          <p>Keep this slip. Present it when claiming your vehicle.</p>
          <p className="slip-footer-email">mtpbovrdivision@gmail.com</p>
        </div>
      </div>
    </div>
  );
}