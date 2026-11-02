import { useState, useEffect } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { LOGOUT_REASON_KEY } from "../../hooks/useAuth";
import { requestPasswordReset } from "../../lib/staffPassword";
import mtpbLogo from "../../assets/mtpb-logo.png";
import cityHallPhoto from "../../assets/cityhall.jpg";
import "./LoginPage.css";

/* ------------------------------------------------------------------
   Background photo of Manila City Hall: src/assets/cityhall.webp
   (about 1920 px wide, under 500 KB is best). To change it, replace that
   file. If the photo needs credit (e.g. a Wikimedia Commons CC BY-SA
   photo), write it in PHOTO_CREDIT; leave it "" for your own photo.
------------------------------------------------------------------ */
const bgStyle = { "--login-photo": `url(${cityHallPhoto})` } as CSSProperties;
const PHOTO_CREDIT = "";
import { endSession } from "../../lib/staffSession";

// Role to home route mapping. Clamping Staff use the enforcer app, not
// this dashboard (there are no /clamping-staff pages — sending them there
// used to bounce between the login page and a missing route forever).
const ROLE_HOME: Record<string, string> = {
  "it-admin": "/it-admin",
  "oic": "/dashboard",
  "impounding-staff": "/impounding-staff",
  "release-officer": "/release-officer",
  "finance": "/finance",
  "supervisor": "/supervisor",
  "record-officer": "/record-officer",
};

const WEB_ACCESS_DENIED: Record<string, string> = {
  "clamping-staff": "Clamping Staff accounts use the MTPB enforcer app, not this dashboard.",
};

/** Why the user was signed out automatically (useAuth), shown once. */
const takeLogoutReason = (): string => {
  try {
    const reason = sessionStorage.getItem(LOGOUT_REASON_KEY) ?? "";
    sessionStorage.removeItem(LOGOUT_REASON_KEY);
    return reason;
  } catch {
    return "";
  }
};

/** "Forgot password?" — sends a reset request to the IT Admin. */
function ForgotPasswordDialog({
  initialUsername,
  onClose,
}: {
  initialUsername: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialUsername.split("@")[0]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");
  const [failed, setFailed] = useState("");

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    setFailed("");
    if (!name.trim()) {
      setFailed("Enter your username.");
      return;
    }
    setSending(true);
    try {
      setSent(await requestPasswordReset(name));
    } catch (err) {
      setFailed((err as Error)?.message || "Couldn't send the request. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="forgot-overlay" role="dialog" aria-modal="true" aria-labelledby="forgot-title">
      <div className="forgot-card">
        <h2 id="forgot-title">Forgot password?</h2>
        {sent ? (
          <>
            <p className="forgot-text">{sent}</p>
            <p className="forgot-text forgot-muted">
              When you get the temporary password, sign in with it — you'll be asked to set a
              new one.
            </p>
            <div className="forgot-actions">
              <button type="button" className="sign-in-btn" onClick={onClose}>
                Back to Sign In
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSend}>
            <p className="forgot-text">
              Enter your username. The IT Admin will reset your password and give you a
              temporary one.
            </p>
            <div className="login-field">
              <label htmlFor="forgot-username">Username</label>
              <div className="input-wrap">
                <input
                  id="forgot-username"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Username"
                  autoComplete="username"
                  disabled={sending}
                  autoFocus
                />
              </div>
            </div>
            {failed && (
              <p className="login-error" role="alert">
                {failed}
              </p>
            )}
            <div className="forgot-actions">
              <button type="button" className="forgot-cancel" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button type="submit" className="sign-in-btn" disabled={sending}>
                {sending ? "Sending..." : "Send Request"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(takeLogoutReason);
  const [showForgot, setShowForgot] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auto-redirect if user is already authenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) return;

        const data = userDoc.data();
        const role = data.role as string;
        const homePath = ROLE_HOME[role];
        const active = String(data.status ?? "active").toLowerCase() === "active";

        if (!active || WEB_ACCESS_DENIED[role]) {
          // Deactivated, or a role that doesn't use the dashboard.
          setError(
            WEB_ACCESS_DENIED[role] ??
              `Your account is ${data.status}. Please contact your administrator.`
          );
          await endSession();
          await signOut(auth);
          return;
        }
        if (homePath) navigate(homePath, { replace: true });
      } catch (err) {
        console.error("[Auth] Auto-redirect error:", err);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please enter both username and password.");
      return;
    }

    setLoading(true);

    try {
      // Build email from username if not already in email format
      const email = username.includes("@") ? username : `${username}@mtpb.gov.ph`;

      // 1. Authenticate with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Fetch user document from Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await endSession();
        await signOut(auth);
        setError("User profile not found. Please contact your administrator.");
        return;
      }

      const userData = userDocSnap.data();
      const role: string = userData.role ?? "";
      const status: string = userData.status ?? "active";

      // 3. Verify account status
      if (status !== "active") {
        await endSession();
        await signOut(auth);
        setError(`Your account is ${status}. Please contact your administrator.`);
        return;
      }

      // 4. Verify role is recognized and uses the dashboard
      if (WEB_ACCESS_DENIED[role]) {
        await endSession();
        await signOut(auth);
        setError(WEB_ACCESS_DENIED[role]);
        return;
      }
      const homePath = ROLE_HOME[role];
      if (!homePath) {
        await endSession();
        await signOut(auth);
        setError(`Unknown role: "${role}". Please contact your administrator.`);
        return;
      }

      // 5. Update lastLogin timestamp (non-blocking)
      try {
        await updateDoc(userDocRef, {
          lastLogin: serverTimestamp(),
        });
      } catch (updateErr) {
        console.error("[Auth] Failed to update lastLogin:", (updateErr as { code?: string })?.code);
        // Login continues even if timestamp update fails
      }

      // 6. Route based on user role
      navigate(homePath, { replace: true });
    } catch (err) {
      console.error("[Auth] Authentication error:", (err as { code?: string })?.code);

      switch ((err as { code?: string })?.code) {
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
          setError("Invalid username or password.");
          break;
        case "auth/too-many-requests":
          setError("Too many failed attempts. Please try again later.");
          break;
        case "auth/invalid-email":
          setError("Invalid username format.");
          break;
        case "auth/network-request-failed":
          setError("Network error. Please check your connection.");
          break;
        default:
          setError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-body login-modern">
      {/* Manila City Hall photo + navy shade (decorative) */}
      <div className="login-bg" aria-hidden="true" style={bgStyle} />

      <div className="login-shell">
        {/* BRAND SIDE */}
        <section className="login-hero" aria-labelledby="login-hero-title">
          <div className="login-hero-brand">
            <img
              src={mtpbLogo}
              alt="Manila Traffic and Parking Bureau seal"
              className="login-hero-logo"
            />
            <span className="login-hero-city">Lungsod ng Maynila</span>
          </div>
          <h1 id="login-hero-title" className="login-hero-title">
            Manila Traffic and Parking Bureau
          </h1>
          <p className="login-hero-sub">Clamping, Impounding and Release Management</p>
        </section>

      <div className="login-card">
        {/* CARD HEADING */}
        <div className="login-card-head">
          <img src={mtpbLogo} alt="" className="login-card-logo" />
          <div>
            <h2 className="login-card-title">MTPB Admin Sign In</h2>
            <p className="login-card-sub">Use your MTPB staff account.</p>
          </div>
        </div>

        {/* FORM */}
        <div className="login-form-section">
          <form onSubmit={handleSubmit} className="login-form">
            {/* Username */}
            <div className="login-field">
              <label htmlFor="username">Username</label>
              <div className="input-wrap">
                <span className="icon-left" aria-hidden="true">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
                  </svg>
                </span>
                <input
                  id="username"
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-field">
              <label htmlFor="password">Password</label>
              <div className="input-wrap">
                <span className="icon-left" aria-hidden="true">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="4" y="10" width="16" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="icon-right"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                      <line x1="3" y1="21" x2="21" y2="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="forgot-row">
              <button type="button" className="forgot-link" onClick={() => setShowForgot(true)}>
                Forgot password?
              </button>
            </div>

            {/* Error */}
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            {/* Submit */}
            <div className="submit-row">
              <button
                type="submit"
                className="sign-in-btn"
                disabled={loading}
              >
                {loading ? "Signing In..." : "Sign In"}
              </button>
            </div>
          </form>

          <footer className="login-footer">
            <span>Manila Traffic and Parking Bureau &copy; 2026</span>
            <span>For authorized MTPB staff only</span>
          </footer>
        </div>
      </div>
      </div>

      {PHOTO_CREDIT && <p className="login-credit">Photo: {PHOTO_CREDIT}</p>}

      {showForgot && (
        <ForgotPasswordDialog initialUsername={username} onClose={() => setShowForgot(false)} />
      )}
    </div>
  );
}

export default LoginPage;
