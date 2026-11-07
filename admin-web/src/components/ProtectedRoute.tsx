// src/components/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { endSession } from "../lib/staffSession";
import ChangePasswordModal from "./ChangePasswordModal";

const ROLE_REDIRECTS: Record<string, string> = {
  "oic": "/dashboard",
  "it-admin": "/it-admin",
  "supervisor": "/supervisor",
  "record-officer": "/record-officer",
  "release-officer": "/release-officer",
  "finance": "/finance",
  // Clamping Staff use the enforcer app; the login page tells them so.
  "clamping-staff": "/",
  "impounding-staff": "/impounding-staff",
};

const logout = async () => {
  try {
    await endSession();
  } finally {
    await signOut(auth);
  }
};

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const { user, role, loading, mustChangePassword } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to={ROLE_REDIRECTS[role ?? ""] ?? "/"} replace />;
  }

  // New account or a password reset by the IT Admin: a temporary password
  // must be replaced before the dashboard opens. The flag clears itself
  // (users/{uid}.mustChangePassword → false), and useAuth sees it live.
  if (mustChangePassword) {
    return (
      <div style={{ minHeight: "100vh", background: "#f3f4f6" }}>
        <ChangePasswordModal forced onClose={() => {}} onLogout={() => void logout()} />
      </div>
    );
  }

  return <>{children}</>;
}
