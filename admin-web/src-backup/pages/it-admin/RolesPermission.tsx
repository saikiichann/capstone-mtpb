import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ITAdminHomePage.css";
import "./RolesPermission.css";

import logo from "../../assets/mtpb-logo.png";
import avatarImg from "../../assets/user.png";
import logoutIcon from "../../assets/logout.png";
import keyIcon from "../../assets/key.png";

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */
type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
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
const ROLE_LABELS: Record<RoleSlug, string> = {
  "oic": "Officer-in-Charge",
  "it-admin": "IT Admin",
  "supervisor": "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  "finance": "Finance",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
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

  /* Click-outside + Escape */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await firebaseSignOut(auth);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.clear();
      setMenuOpen(false);
      navigate("/");
    } catch (err) {
      console.error("Logout error:", err);
      setMenuOpen(false);
      navigate("/");
    }
  };

  return (
    <div className="it-admin-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={logo} alt="MTPB logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">IT Admin</p>
            </div>
          </div>
          <nav className="sidebar-nav">
            {navGroups.map((group) => (
              <div className="nav-group" key={group.title}>
                <p className="nav-group-title">{group.title}</p>
                <ul className="nav-list">
                  {group.items.map((item) => {
                    const IconComponent = item.icon;
                    return (
                      <li key={item.label}>
                        <button
                          type="button"
                          className={`nav-item${item.active ? " active" : ""}`}
                          onClick={() => navigate(item.path)}
                        >
                          <IconComponent size={16} className="nav-icon-svg" />
                          <span>{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* MAIN */}
        <main className="main">
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

            <div className="avatar-container" ref={menuRef}>
              <img
                src={avatarImg}
                alt="Account menu"
                className="avatar-img"
                onClick={() => setMenuOpen((open) => !open)}
              />
              {menuOpen && (
                <div className="profile-dropdown" role="menu">
                  <div className="dropdown-header">
                    <p className="dropdown-name">{currentUser.name}</p>
                    <p className="dropdown-role">{ROLE_LABELS[currentUser.role]}</p>
                  </div>
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    <img src={keyIcon} alt="" className="dropdown-icon" />
                    <span>Change Password</span>
                  </button>
                  <button
                    type="button"
                    className="dropdown-item logout"
                    onClick={handleLogout}
                  >
                    <img src={logoutIcon} alt="" className="dropdown-icon" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          <div className="roles-content">
            <article className="card">
              <div className="card-header-static">
                <h2 className="card-title-static">Role &amp; Permission Matrix</h2>
              </div>

              <div className="matrix-scroll">
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