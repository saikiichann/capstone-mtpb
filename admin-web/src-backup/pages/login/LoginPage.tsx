import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";
import mtpbLogo from "../../assets/mtpb-logo.png";
import "./LoginPage.css";

// Role to home route mapping
const ROLE_HOME: Record<string, string> = {
  "it-admin": "/it-admin",
  "oic": "/dashboard",
  "impounding-staff": "/impounding-staff",
  "release-officer": "/release-officer",
  "finance": "/finance",
  "clamping-staff": "/clamping-staff",
  "supervisor": "/supervisor",
  "record-officer": "/record-officer",
};

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-redirect if user is already authenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) return;

        const role = userDoc.data().role as string;
        const homePath = ROLE_HOME[role];

        if (homePath) {
          console.log(`[Auth] Already logged in as ${role}, redirecting to ${homePath}`);
          navigate(homePath, { replace: true });
        }
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
      console.log("[Auth] Authenticated user:", user.uid);

      // 2. Fetch user document from Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await signOut(auth);
        setError("User profile not found. Please contact your administrator.");
        return;
      }

      const userData = userDocSnap.data();
      const role: string = userData.role ?? "";
      const status: string = userData.status ?? "active";

      console.log("[Auth] User role:", role);

      // 3. Verify account status
      if (status !== "active") {
        await signOut(auth);
        setError(`Your account is ${status}. Please contact your administrator.`);
        return;
      }

      // 4. Verify role is recognized
      const homePath = ROLE_HOME[role];
      if (!homePath) {
        await signOut(auth);
        setError(`Unknown role: "${role}". Please contact your administrator.`);
        return;
      }

      // 5. Update lastLogin timestamp (non-blocking)
      try {
        await updateDoc(userDocRef, {
          lastLogin: serverTimestamp(),
        });
        console.log("[Auth] Last login timestamp updated.");
      } catch (updateErr: any) {
        console.error("[Auth] Failed to update lastLogin:", updateErr.code);
        // Login continues even if timestamp update fails
      }

      // 6. Route based on user role
      console.log(`[Router] Redirecting ${role} to ${homePath}`);
      navigate(homePath, { replace: true });
    } catch (err: any) {
      console.error("[Auth] Authentication error:", err.code);

      switch (err.code) {
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
    <div className="login-body">
      <div className="login-card">
        {/* HEADER */}
        <div className="login-header">
          <div className="login-logo">
            <img
              src={mtpbLogo}
              alt="Manila Traffic and Parking Bureau Seal"
              className="login-logo-img"
            />
          </div>
          <div className="login-titles">
            <h1>Manila Traffic and Parking Bureau</h1>
            <p>Integrated Enforcement System</p>
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
            Manila Traffic and Parking Bureau &copy; 2026
          </footer>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;