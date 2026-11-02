import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Activity,
  DatabaseBackup,
  Users,
  ShieldCheck,
  Monitor,
  FileText,
  Lock,
  Settings,
  Check,
  QrCode,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ITAdminHomepage.css";
import "./RolesPermission.css";

import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */
type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  path: string;
  active?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

type RoleSlug =
  | "oic"
  | "it-admin"
  | "supervisor"
  | "record-officer"
  | "release-officer"
  | "finance"
  | "clamping-staff"
  | "impounding-staff";

type CurrentUser = {
  name: string;
  role: RoleSlug;
};

type RoleAbbr = "OIC" | "SUP" | "REC" | "REL" | "FIN" | "CLM" | "IMP" | "ITA";

/* ------------------------------------------------------------------
   ROLE MAP
------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   NAV BAR
------------------------------------------------------------------ */
const navGroups: NavGroup[] = [
  {
    title: "Dashboard",
    items: [
      { label: "Overview", icon: LayoutDashboard, path: "/it-admin" },
    ],
  },
  {
    title: "Monitoring",
    items: [
      { label: "System Health", icon: Activity, path: "/it-admin/system-health" },
      { label: "Backup & Restore", icon: DatabaseBackup, path: "/it-admin/backup" },
    ],
  },
  {
    title: "Access Control",
    items: [
      { label: "User Management", icon: Users, path: "/it-admin/users" },
      { label: "Roles & Permissions", icon: ShieldCheck, path: "/it-admin/roles", active: true },
      { label: "Session Monitor", icon: Monitor, path: "/it-admin/sessions" },
    ],
  },
  {
    title: "Enforcement Tools",
    items: [
      { label: "QR Codes", icon: QrCode, path: "/it-admin/qr-codes" },
    ],
  },
  {
    title: "Audit & Compliance",
    items: [
      { label: "Audit Log", icon: FileText, path: "/it-admin/audit-log" },
      { label: "Data Privacy Log", icon: Lock, path: "/it-admin/data-privacy" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { label: "Settings", icon: Settings, path: "/it-admin/settings" },
    ],
  },
];

/* ------------------------------------------------------------------
   ROLE COLUMNS
------------------------------------------------------------------ */
const ROLES: { abbr: RoleAbbr; label: string }[] = [
  { abbr: "OIC", label: "Officer-in-Charge" },
  { abbr: "SUP", label: "Supervisor" },
  { abbr: "REC", label: "Record Officer" },
  { abbr: "REL", label: "Release Officer" },
  { abbr: "FIN", label: "Finance" },
  { abbr: "CLM", label: "Clamping Staff" },
  { abbr: "IMP", label: "Impounding Staff" },
  { abbr: "ITA", label: "IT Admin" },
];

/* ------------------------------------------------------------------
   PERMISSION MATRIX
------------------------------------------------------------------ */
type PermissionMap = Record<RoleAbbr, boolean>;

type ModuleRow = {
  module: string;
  permissions: PermissionMap;
};

const PERMISSION_MATRIX: ModuleRow[] = [
  {
    module: "Enforcement / Violations",
    permissions: { OIC: true, SUP: true, REC: true, REL: true, FIN: true, CLM: true, IMP: true, ITA: false },
  },
  {
    module: "Finance / Payments",
    permissions: { OIC: true, SUP: false, REC: false, REL: false, FIN: true, CLM: false, IMP: false, ITA: false },
  },
  {
    module: "Vehicle Release",
    permissions: { OIC: true, SUP: true, REC: true, REL: true, FIN: true, CLM: false, IMP: false, ITA: false },
  },
  {
    module: "Operations / Scheduling",
    permissions: { OIC: true, SUP: true, REC: false, REL: false, FIN: false, CLM: false, IMP: false, ITA: false },
  },
  {
    module: "Analytics / Heatmap",
    permissions: { OIC: true, SUP: true, REC: false, REL: false, FIN: false, CLM: false, IMP: false, ITA: false },
  },
  {
    module: "User Management",
    permissions: { OIC: false, SUP: false, REC: false, REL: false, FIN: false, CLM: false, IMP: false, ITA: true },
  },
  {
    module: "Roles & Permissions",
    permissions: { OIC: false, SUP: false, REC: false, REL: false, FIN: false, CLM: false, IMP: false, ITA: true },
  },
  {
    module: "Audit Log",
    permissions: { OIC: false, SUP: false, REC: false, REL: false, FIN: false, CLM: false, IMP: false, ITA: true },
  },
  {
    module: "System Settings",
    permissions: { OIC: false, SUP: false, REC: false, REL: false, FIN: false, CLM: false, IMP: false, ITA: true },
  },
  {
    module: "Backup & Restore",
    permissions: { OIC: false, SUP: false, REC: false, REL: false, FIN: false, CLM: false, IMP: false, ITA: true },
  },
  {
    module: "Service / Error Logs",
    permissions: { OIC: false, SUP: false, REC: false, REL: false, FIN: false, CLM: false, IMP: false, ITA: true },
  },
];

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function RolesPermission() {

  const [, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  /* Fetch current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "it-admin" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "it-admin") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "it-admin",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="it-admin-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={navGroups} role={<>IT Admin</>} />

        {/* MAIN */}
        <main className="main">
          <AppTopbar groups={navGroups} />
          <header className="main-header">
            <div>
              <h1>Roles &amp; Permissions</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

          </header>

          <div className="roles-content" tabIndex={0} role="region" aria-label="Roles and permissions" data-scroll-region>
            <article className="card">
              <div className="card-header-static">
                <h2 className="card-title-static">Role &amp; Permission Matrix</h2>
              </div>

              <div className="matrix-scroll" tabIndex={0} role="region" aria-label="Permissions matrix" data-scroll-region>
                <table className="permission-matrix">
                  <thead>
                    <tr>
                      <th className="col-module">Module</th>
                      {ROLES.map((r) => (
                        <th key={r.abbr} className="col-role" title={r.label}>
                          {r.abbr}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSION_MATRIX.map((row) => (
                      <tr key={row.module}>
                        <td className="cell-module">{row.module}</td>
                        {ROLES.map((r) => {
                          const allowed = row.permissions[r.abbr];
                          return (
                            <td key={r.abbr} className="cell-permission">
                              {allowed ? (
                                <span
                                  className="perm-icon perm-allowed"
                                  title={`${r.label}: Allowed`}
                                >
                                  <Check size={15} strokeWidth={3} />
                                </span>
                              ) : (
                                <span
                                  className="perm-icon perm-locked"
                                  title={`${r.label}: Locked`}
                                >
                                  <Lock size={14} strokeWidth={2.2} />
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <div style={{ height: 24 }} />
          </div>
        </main>
      </div>
    </div>
  );
}