/* ------------------------------------------------------------------
   IT ADMIN — staff password resets (User Management)

   - ResetRequestsPanel: "Forgot password?" requests from the login page
     (passwordResetRequests, status "pending"), with Reset / Dismiss.
   - ResetPasswordDialog: confirms, resets on the server
     (lib/staffPassword.ts), then shows the temporary password ONCE so the
     IT Admin can give it to the person directly. It is never stored.
------------------------------------------------------------------ */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Copy, KeyRound, X } from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { resetStaffPassword } from "../../lib/staffPassword";
import "./PasswordReset.css";

export type ResetTarget = { uid: string; name: string; username: string; role: string };

type ResetRequest = ResetTarget & { id: string; requestedAt: Timestamp | null };

const timeAgo = (t: Timestamp | null): string => {
  if (!t) return "just now";
  const mins = Math.floor((Date.now() - t.toMillis()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return t.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** Pending "Forgot password?" requests. Renders nothing when there are none. */
export function ResetRequestsPanel({
  roleLabel,
  onReset,
}: {
  roleLabel: (role: string) => string;
  onReset: (target: ResetTarget) => void;
}) {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [dismissing, setDismissing] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "passwordResetRequests"), where("status", "==", "pending")),
      (snap) =>
        setRequests(
          snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                uid: String(data.uid ?? ""),
                name: String(data.name ?? data.username ?? ""),
                username: String(data.username ?? ""),
                role: String(data.role ?? ""),
                requestedAt: (data.requestedAt as Timestamp) ?? null,
              };
            })
            .sort((a, b) => (a.requestedAt?.toMillis() ?? 0) - (b.requestedAt?.toMillis() ?? 0))
        ),
      (err) => console.warn("Password reset requests not loaded:", err.code)
    );
    return () => unsubscribe();
  }, []);

  if (requests.length === 0) return null;

  const dismiss = async (id: string) => {
    setDismissing(id);
    try {
      await updateDoc(doc(db, "passwordResetRequests", id), {
        status: "dismissed",
        resolvedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Request not dismissed:", err);
      alert("Couldn't dismiss the request. Please try again.");
    } finally {
      setDismissing(null);
    }
  };

  return (
    <div className="pr-panel" role="region" aria-label="Password reset requests">
      <div className="pr-panel-head">
        <KeyRound size={18} />
        <h2>Password reset requests</h2>
        <span className="pr-count">{requests.length}</span>
      </div>
      <p className="pr-panel-sub">
        Sent from "Forgot password?" on the login page. Check that it's really them before
        resetting — call or see the person.
      </p>
      <ul className="pr-list">
        {requests.map((r) => (
          <li key={r.id} className="pr-item">
            <div className="pr-who">
              <strong>{r.name}</strong>
              <span>
                {r.username} · {roleLabel(r.role)} · {timeAgo(r.requestedAt)}
              </span>
            </div>
            <div className="pr-actions">
              <button
                type="button"
                className="pr-btn"
                onClick={() => void dismiss(r.id)}
                disabled={dismissing === r.id}
              >
                Dismiss
              </button>
              <button
                type="button"
                className="pr-btn pr-btn-primary"
                onClick={() => onReset({ uid: r.uid, name: r.name, username: r.username, role: r.role })}
              >
                Reset password
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Confirm → reset → show the temporary password once. */
export function ResetPasswordDialog({
  target,
  onClose,
}: {
  target: ResetTarget;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const handleReset = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await resetStaffPassword(target.uid);
      setPassword(result.temporaryPassword);
    } catch (err) {
      setError((err as Error)?.message || "Couldn't reset the password. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the password is on screen to read out.
    }
  };

  return createPortal(
    <div className="pr-overlay" role="dialog" aria-modal="true" aria-labelledby="pr-title">
      <div className="pr-dialog">
        <div className="pr-dialog-head">
          <h3 id="pr-title">{password ? "Temporary password" : "Reset password"}</h3>
          {!busy && (
            <button type="button" className="pr-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          )}
        </div>

        {password ? (
          <>
            <p className="pr-text">
              Give this to <strong>{target.name}</strong> ({target.username}) in person or by phone.
              It is shown only once.
            </p>
            <div className="pr-password">
              <code>{password}</code>
              <button type="button" className="pr-btn" onClick={() => void copy()}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="pr-text pr-muted">
              They'll sign in with it and must set a new password right away. Any device still
              signed in to their account will be signed out.
            </p>
            <div className="pr-dialog-actions">
              <button type="button" className="pr-btn pr-btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="pr-text">
              Reset the password of <strong>{target.name}</strong> ({target.username})? Their
              current password will stop working and you'll get a temporary one to give them.
            </p>
            {error && (
              <div className="pr-error" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            <div className="pr-dialog-actions">
              <button type="button" className="pr-btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="pr-btn pr-btn-primary"
                onClick={() => void handleReset()}
                disabled={busy}
              >
                {busy ? "Resetting..." : "Reset password"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
