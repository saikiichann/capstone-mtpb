// src/hooks/useAuth.ts
//
// Signed-in staff user + role, kept LIVE from users/{uid}:
//   - If the IT Admin sets the account to inactive / suspended (or deletes
//     it), the user is signed out right away, even mid-session, and the
//     login page says why.
//   - If the role changes, ProtectedRoute sends the user to the new
//     role's pages.
//   - Keeps a session record for the IT Admin's Session Monitor
//     (lib/staffSession.ts): started here, refreshed every 5 minutes, and
//     if the IT Admin revokes it the user is signed out right away.
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  HEARTBEAT_MS,
  endSession,
  ensureSession,
  forgetSession,
  touchSession,
} from "../lib/staffSession";
import { checkAndRecord, recordPageLoad } from "../lib/systemMonitor";

/** Read once by the login page to explain an automatic sign-out. */
export const LOGOUT_REASON_KEY = "mtpb:logoutReason";

const forceSignOut = async (reason: string) => {
  try {
    sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
  } catch {
    // storage unavailable — the sign-out still happens
  }
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  await endSession();
  await signOut(auth).catch(() => {});
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** IT Admin reset the password: a new one must be set first. */
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [name, setName] = useState("");
  /** Bumped when the session record disappears, to start a new one. */
  const [sessionNonce, setSessionNonce] = useState(0);

  useEffect(() => {
    let stopProfile: (() => void) | null = null;

    const stopAuth = onAuthStateChanged(auth, (loggedUser) => {
      stopProfile?.();
      stopProfile = null;

      if (!loggedUser) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      stopProfile = onSnapshot(
        doc(db, "users", loggedUser.uid),
        (snap) => {
          const data = snap.data();
          const status = String(data?.status ?? "").toLowerCase();
          if (!snap.exists() || status !== "active") {
            // Leave the protected pages right away, then sign out.
            setUser(null);
            setRole(null);
            setLoading(false);
            void forceSignOut(
              !snap.exists()
                ? "Your account was removed. Please contact your administrator."
                : `Your account is ${status || "not active"}. Please contact your administrator.`
            );
            return;
          }
          setUser(loggedUser);
          setRole((data?.role as string) ?? null);
          setName(String(data?.name ?? loggedUser.email?.split("@")[0] ?? "Staff"));
          setMustChangePassword(data?.mustChangePassword === true);
          setLoading(false);
        },
        () => {
          // Profile can't be read (e.g. rules deny it): treat as signed out.
          setUser(loggedUser);
          setRole(null);
          setLoading(false);
        }
      );
    });

    return () => {
      stopProfile?.();
      stopAuth();
    };
  }, []);

  /* Session record: start it, keep it fresh, and obey a revoke. */
  const uid = user?.uid ?? null;
  useEffect(() => {
    if (!uid || !role) return;
    let stopWatch: (() => void) | null = null;
    let cancelled = false;

    void ensureSession({ uid, name: name || "Staff", role }).then((id) => {
      if (cancelled) return;
      // Real health checks (System Health, Uptime) and page-load time.
      void recordPageLoad();
      void checkAndRecord();
      if (!id) return;
      stopWatch = onSnapshot(
        doc(db, "sessions", id),
        (snap) => {
          if (!snap.exists()) {
            // Record deleted (e.g. cleaned up by the IT Admin): start a new one.
            forgetSession();
            setSessionNonce((n) => n + 1);
            return;
          }
          if (snap.data()?.revoked === true) {
            forgetSession();
            setUser(null);
            setRole(null);
            void forceSignOut("Your session was ended by the IT Admin. Please log in again.");
          }
        },
        () => {
          // can't read it (rules / offline): keep working
        }
      );
    });

    const beat = window.setInterval(() => {
      void touchSession(uid);
      void checkAndRecord();
    }, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      stopWatch?.();
      window.clearInterval(beat);
    };
  }, [uid, role, name, sessionNonce]);

  return { user, role, loading, mustChangePassword };
}
