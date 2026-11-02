// src/components/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const ROLE_REDIRECTS: Record<string, string> = {
  "oic": "/dashboard",
  "it-admin": "/it-admin",
  "supervisor": "/supervisor",
  "record-officer": "/record-officer",
  "release-officer": "/release-officer",
  "finance": "/finance",
  "clamping-staff": "/clamping-staff",
  "impounding-staff": "/impounding-staff",
};

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const { user, role, loading } = useAuth();

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

  return <>{children}</>;
}