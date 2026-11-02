/* ------------------------------------------------------------------
   IMPOUND DESK QR — one static QR posted at the impound desk.

   The owner scans it, enters the plate number and the last 4 digits of
   the UOVR No. on their Blue Ticket, and pays the impound fee online on
   the violator app. The QR never changes, so it is printed once.

   Shown as a toolbar button on QR Code Management; the print looks like
   a clamp QR print (the QR and a short label). If the violator app's
   page ever moves, update IMPOUND_DESK_URL and print again.
------------------------------------------------------------------ */
import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { Download, Printer, QrCode, X } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { downloadBlob } from "../../lib/engraveQr";
import { clientIp } from "../../lib/staffSession";

export const IMPOUND_DESK_URL = "https://mtpb-violators-pwa.vercel.app/pay-impound";
const LABEL = "IMPOUND PAYMENT";

async function logAction(userName: string, action: string) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      userName,
      action,
      record: "Impound desk QR",
      type: "qr-export",
      timestamp: serverTimestamp(),
      ipAddress: clientIp(),
    });
  } catch (err) {
    console.warn("Impound desk QR action not logged:", err);
  }
}

/** Same layout as a clamp QR print: the QR and its label. */
function printQr(): boolean {
  const win = window.open("", "_blank", "width=600,height=800");
  if (!win) {
    alert("The print window was blocked. Allow pop-ups for this site and try again.");
    return false;
  }
  const qr = renderToStaticMarkup(
    <QRCodeSVG value={IMPOUND_DESK_URL} size={300} level="H" />
  );
  win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Print QR - Impound payment</title>
    <style>
      @page { size: auto; margin: 5mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
      .qr-block { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
      .qr-block svg { display: block; width: 300px; height: 300px; }
      .qr-id { font-size: 20px; font-weight: 700; color: #000; margin: 0; letter-spacing: 1px; font-family: 'Courier New', monospace; text-align: center; }
      .qr-sub { font-size: 13px; color: #333; margin: 0; text-align: center; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <div class="qr-block">
      ${qr}
      <p class="qr-id">${LABEL}</p>
      <p class="qr-sub">Scan to pay your impound fee</p>
    </div>
    <scr` + `ipt>
      window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });
    </scr` + `ipt>
  </body>
</html>`);
  win.document.close();
  return true;
}

function downloadSvg() {
  const svg = renderToStaticMarkup(
    <QRCodeSVG value={IMPOUND_DESK_URL} size={1024} level="H" marginSize={4} />
  );
  downloadBlob(
    new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: "image/svg+xml" }),
    "MTPB-impound-payment-QR.svg"
  );
}

export default function ImpoundDeskQR({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const onPrint = () => {
    if (printQr()) void logAction(userName, "printed the impound payment QR");
  };
  const onDownload = () => {
    downloadSvg();
    void logAction(userName, "downloaded the impound payment QR (SVG)");
  };

  return (
    <>
      <button
        type="button"
        className="btn-engrave"
        onClick={() => setOpen(true)}
        title="The one QR posted at the impound desk for online impound payment"
      >
        <QrCode size={18} />
        <span>Impound QR</span>
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="impound-qr-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title" id="impound-qr-title">
                Impound Payment QR
              </h3>
              <button aria-label="Close" className="modal-close-btn" onClick={() => setOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="generated-qr-grid">
                <div className="generated-qr-item">
                  <QRCodeSVG value={IMPOUND_DESK_URL} size={160} level="H" />
                  <p className="generated-qr-label">{LABEL}</p>
                </div>
              </div>
              <p className="modal-note">
                One QR for the impound desk. The owner scans it, enters the plate number and the
                last 4 digits of the UOVR No. on the Blue Ticket, and pays online. Every impound uses
                this same QR, so print it once.
              </p>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setOpen(false)}>
                Close
              </button>
              <button className="btn-secondary" onClick={onDownload}>
                <Download size={16} />
                <span>Download SVG</span>
              </button>
              <button className="btn-primary" onClick={onPrint}>
                <Printer size={16} />
                <span>Print QR</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
