import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Modal from './Modal';
import './ChangePasswordModal.css';

export type ChangePasswordModalProps = {
  onClose: () => void;
};

export default function ChangePasswordModal({
  onClose,
}: ChangePasswordModalProps): JSX.Element {
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function handleUpdate() {
    // TODO: wire to backend later
    if (!current || !newPass || !confirm) {
      alert('Please fill in all fields');
      return;
    }
    if (newPass !== confirm) {
      alert('New password and confirmation do not match');
      return;
    }
    console.log('Change password requested');
    onClose();
  }

  return (
    <Modal title="Change Password" onClose={onClose}>
      {/* Current Password */}
      <div className="cp-field">
        <label className="cp-label">CURRENT PASSWORD</label>
        <div className="cp-input-wrap">
          <input
            type={showCurrent ? 'text' : 'password'}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="••••••••"
            className="cp-input"
          />
          <button
            type="button"
            className="cp-eye-btn"
            onClick={() => setShowCurrent((s) => !s)}
            aria-label="Toggle password visibility"
          >
            {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* New Password */}
      <div className="cp-field">
        <label className="cp-label">NEW PASSWORD</label>
        <div className="cp-input-wrap">
          <input
            type={showNew ? 'text' : 'password'}
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="••••••••"
            className="cp-input"
          />
          <button
            type="button"
            className="cp-eye-btn"
            onClick={() => setShowNew((s) => !s)}
            aria-label="Toggle password visibility"
          >
            {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* Confirm New Password */}
      <div className="cp-field">
        <label className="cp-label">CONFIRM NEW PASSWORD</label>
        <div className="cp-input-wrap">
          <input
            type={showConfirm ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className="cp-input"
          />
          <button
            type="button"
            className="cp-eye-btn"
            onClick={() => setShowConfirm((s) => !s)}
            aria-label="Toggle password visibility"
          >
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="modal-actions">
        <button onClick={onClose} className="btn btn-secondary">
          Cancel
        </button>
        <button onClick={handleUpdate} className="btn btn-primary">
          Update Password
        </button>
      </div>
    </Modal>
  );
}