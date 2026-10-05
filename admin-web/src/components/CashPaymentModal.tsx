import React, { useState, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import Modal from './Modal';
import './CashPaymentModal.css';

/* ---- Reference No. generator (session-only) ---- */

let refCounter = 0;

function generateReferenceNo(): string {
  refCounter += 1;
  const year = new Date().getFullYear();
  const padded = refCounter.toString().padStart(4, '0');
  return `REF-${year}-${padded}`;
}

/* ---- Helpers ---- */

function formatPeso(value: number): string {
  return `₱${value.toLocaleString()}`;
}

/* ---- Props ---- */

type CashPaymentRow = {
  violationNo: string;
  cin: string;
  plate: string;
  amount: number;
  amountLabel: string;
};

type CashPaymentModalProps = {
  row: CashPaymentRow;
  onClose: () => void;
  onConfirm: (row: CashPaymentRow, cashReceived: number) => void;
};

export default function CashPaymentModal({
  row,
  onClose,
  onConfirm,
}: CashPaymentModalProps) {
  const referenceNo = useMemo(() => generateReferenceNo(), []);
  const [cashInput, setCashInput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState<{
    cashReceived: number;
    change: number;
  } | null>(null);

  function handleCopy() {
    navigator.clipboard.writeText(referenceNo).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  
  function handleCashChange(raw: string) {
    setCashInput(raw.replace(/\D/g, ''));
    if (error) setError('');
  }

  function handleConfirm() {
    setError('');
    const parsed = Number(cashInput);

    if (!cashInput.trim() || Number.isNaN(parsed)) {
      setError('Please enter the cash amount received.');
      return;
    }
    if (parsed < row.amount) {
      setError(
        `Cash received is less than the amount due (${row.amountLabel}). Partial payments are not allowed.`
      );
      return;
    }

    /* Valid — show change, then close after a beat */
    const change = parsed - row.amount;
    setConfirmed({ cashReceived: parsed, change });
    setTimeout(() => {
      onConfirm(row, parsed);
    }, 1800);
  }

  const locked = confirmed !== null;

  return (
    <Modal title={`Cash Payment — ${row.violationNo}`} onClose={onClose}>
      {/* Reference No. box */}
      <div className="cp-ref-box">
        <label className="cp-ref-label">REFERENCE NO. </label>
        <div className="cp-ref-row">
          <span className="cp-ref-value">{referenceNo}</span>
          <button
            type="button"
            className="cp-copy-btn"
            onClick={handleCopy}
            aria-label="Copy reference number"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="cp-details">
        <div className="cp-detail-row">
          <span className="cp-detail-label">CIN</span>
          <span className="cp-detail-value">{row.cin}</span>
        </div>
        <div className="cp-detail-row">
          <span className="cp-detail-label">Plate No.</span>
          <span className="cp-detail-value">{row.plate}</span>
        </div>
        <div className="cp-detail-row">
          <span className="cp-detail-label">Amount Due</span>
          <span className="cp-detail-value cp-detail-amount">
            {row.amountLabel}
          </span>
        </div>
      </div>

      {/* Cash input */}
      <div className="cp-field">
        <label className="cp-label">CASH RECEIVED (₱)</label>
        <input
          type="text"
          inputMode="numeric"
          value={cashInput}
          onChange={(e) => handleCashChange(e.target.value)}
          placeholder={row.amount.toString()}
          className="cp-input"
          disabled={locked}
        />
      </div>

      {/* Error */}
      {error && <div className="cp-error">{error}</div>}

      {/* Success + change breakdown */}
      {confirmed && (
        <div className="cp-success">
          <div className="cp-success-title">Cash payment recorded.</div>
          <div className="cp-success-rows">
            <div className="cp-success-row">
              <span>Cash received</span>
              <span>{formatPeso(confirmed.cashReceived)}</span>
            </div>
            <div className="cp-success-row">
              <span>Amount due</span>
              <span>−{formatPeso(row.amount)}</span>
            </div>
            <div className="cp-success-row cp-success-change">
              <span>Change</span>
              <span>{formatPeso(confirmed.change)}</span>
            </div>
          </div>
          <div className="cp-success-note">
            Moving to Payment Verification…
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="modal-actions">
        <button
          onClick={onClose}
          className="btn btn-secondary"
          disabled={locked}
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          className="btn btn-primary"
          disabled={locked}
        >
          Confirm Payment
        </button>
      </div>
    </Modal>
  );
}