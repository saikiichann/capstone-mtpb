import { type JSX, useState } from 'react';
import { Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import Modal from './Modal';
import './ChangePasswordModal.css';

export type ChangePasswordModalProps = {
  onClose: () => void;
};

const MIN_LENGTH = 8;

/** Firebase Auth error codes → messages a staff member can act on. */
const authMessage = (code: string): string => {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Your current password is incorrect.';
    case 'auth/weak-password':
      return `The new password is too weak. Use at least ${MIN_LENGTH} characters with letters and numbers.`;
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/requires-recent-login':
      return 'For security, please log out and log in again, then change your password.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    default:
      return 'Could not change the password. Please try again.';
  }
};

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
  disabled: boolean;
};

function PasswordField({ label, value, onChange, visible, onToggle, autoComplete, disabled }: FieldProps) {
  return (
    <div className="cp-field">
      <label className="cp-label">{label}</label>
      <div className="cp-input-wrap">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className="cp-input"
          autoComplete={autoComplete}
          disabled={disabled}
        />
        <button
          type="button"
          className="cp-eye-btn"
          onClick={onToggle}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

/**
 * Changes the signed-in staff member's password with Firebase Auth:
 * re-checks the current password, then sets the new one. Used from the
 * profile menu of every dashboard.
 */
export default function ChangePasswordModal({
  onClose,
}: ChangePasswordModalProps): JSX.Element {
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleUpdate() {
    setError('');
    if (!current || !newPass || !confirm) {
      setError('Please fill in all fields.');
      return;
    }
    if (newPass.length < MIN_LENGTH) {
      setError(`The new password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (!/[A-Za-z]/.test(newPass) || !/\d/.test(newPass)) {
      setError('Use both letters and numbers in the new password.');
      return;
    }
    if (newPass === current) {
      setError('The new password must be different from the current one.');
      return;
    }
    if (newPass !== confirm) {
      setError('The new password and confirmation do not match.');
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      setError('You are not signed in. Please log in again.');
      return;
    }

    setSaving(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, newPass);

      // Best effort: these don't undo the change if they fail.
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          passwordChangedAt: serverTimestamp(),
          mustChangePassword: false,
        });
      } catch (err) {
        console.warn('Password change not noted on the user profile:', err);
      }
      try {
        await addDoc(collection(db, 'auditLogs'), {
          userName: user.email,
          userId: user.uid,
          action: 'changed their password',
          record: user.email,
          type: 'password-change',
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Audit log not written:', err);
      }

      setDone(true);
      setTimeout(onClose, 1400);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      console.error('Change password failed:', code || err);
      setError(authMessage(code));
      setSaving(false);
    }
  }

  return (
    <Modal title="Change Password" onClose={saving && !done ? () => {} : onClose}>
      {done ? (
        <div className="cp-success" role="status">
          <CheckCircle2 size={20} />
          <span>Your password has been changed.</span>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleUpdate();
          }}
        >
          <PasswordField
            label="Current password"
            value={current}
            onChange={setCurrent}
            visible={showCurrent}
            onToggle={() => setShowCurrent((s) => !s)}
            autoComplete="current-password"
            disabled={saving}
          />
          <PasswordField
            label="New password"
            value={newPass}
            onChange={setNewPass}
            visible={showNew}
            onToggle={() => setShowNew((s) => !s)}
            autoComplete="new-password"
            disabled={saving}
          />
          <PasswordField
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            visible={showConfirm}
            onToggle={() => setShowConfirm((s) => !s)}
            autoComplete="new-password"
            disabled={saving}
          />
          <p className="cp-hint">
            At least {MIN_LENGTH} characters, with letters and numbers.
          </p>

          {error && (
            <div className="cp-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="cp-actions">
            <button type="button" onClick={onClose} className="cp-btn cp-btn-secondary" disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>
              {saving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
