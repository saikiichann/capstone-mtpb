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
  RefreshCw,
  MoreHorizontal,
  QrCode,
} from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ITAdminHomePage.css";
import "./SystemHealth.css";

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

type ServiceRow = {
  id: string;
  service: string;
  status: "Online" | "Scheduled" | "Offline";
  avgResponse: string;
  lastChecked: string;
  order: number;
};

type PerfLogRow = {
  id: string;
  time: string;
  event: string;
  value: string;
  status: "Normal" | "Watch" | "Critical";
};

type ErrorLogRow = {
  id: string;
  time: string;
  severity: "Warning" | "Error" | "Critical";
  service: string;
  description: string;
  status: "Resolved" | "Open" | "Investigating";
};

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
   NAVIGATION
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
      {
        label: "System Health",
        icon: Activity,
        path: "/it-admin/system-health",
        active: true,
      },
      {
        label: "Backup & Restore",
        icon: DatabaseBackup,
        path: "/it-admin/backup",
      },
    ],
  },
  {
    title: "Access Control",
    items: [
      { label: "User Management", icon: Users, path: "/it-admin/users" },
      {
        label: "Roles & Permissions",
        icon: ShieldCheck,
        path: "/it-admin/roles",
      },
      {
        label: "Session Monitor",
        icon: Monitor,
        path: "/it-admin/sessions",
      },
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
      {
        label: "Data Privacy Log",
        icon: Lock,
        path: "/it-admin/data-privacy",
      },
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
   HELPERS
------------------------------------------------------------------ */
const formatTime = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const formatTimestamp = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    const date = ts.toDate();
    return formatTime(date);
  } catch {
    return "—";
  }
};

const FALLBACK_SERVICES: Omit<ServiceRow, "lastChecked">[] = [
  {
    id: "firestore",
    service: "Cloud Firestore (database)",
    status: "Online",
    avgResponse: "12 ms",
    order: 1,
  },
  {
    id: "auth",
    service: "Firebase Authentication",
    status: "Online",
    avgResponse: "8 ms",
    order: 2,
  },
  {
    id: "storage",
    service: "Supabase Storage (files)",
    status: "Online",
    avgResponse: "24 ms",
    order: 3,
  },
  {
    id: "fcm",
    service: "FCM Push Notifications",
    status: "Online",
    avgResponse: "—",
    order: 4,
  },
  {
    id: "backup",
    service: "Backup service",
    status: "Scheduled",
    avgResponse: "—",
    order: 5,
  },
];

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function SystemHealth() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [perfLogs, setPerfLogs] = useState<PerfLogRow[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLogRow[]>([]);

  const [servicesLoading, setServicesLoading] = useState(true);
  const [perfLoading, setPerfLoading] = useState(true);
  const [errorsLoading, setErrorsLoading] = useState(true);

  const [refreshing, setRefreshing] = useState<string | null>(null);

  /* Fetch current authenticated user */
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

  /* Real-time listener: systemHealth */
  useEffect(() => {
    const statusRef = collection(db, "systemHealth");
    const statusQuery = query(statusRef, orderBy("order", "asc"));

    const unsubscribe = onSnapshot(
      statusQuery,
      (snapshot) => {
        if (snapshot.empty) {
          const now = new Date();
          setServices(
            FALLBACK_SERVICES.map((s) => ({
              ...s,
              lastChecked: formatTime(now),
            }))
          );
        } else {
          const fetched: ServiceRow[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              service: data.name ?? "Unknown Service",
              status: (data.status ?? "Online") as
                | "Online"
                | "Scheduled"
                | "Offline",
              avgResponse: data.avgResponse ?? "—",
              lastChecked: formatTimestamp(data.lastChecked),
              order: data.order ?? 999,
            };
          });
          setServices(fetched);
        }
        setServicesLoading(false);
      },
      (error) => {
        console.error("Error fetching systemHealth:", error);
        const now = new Date();
        setServices(
          FALLBACK_SERVICES.map((s) => ({
            ...s,
            lastChecked: formatTime(now),
          }))
        );
        setServicesLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* Real-time listener: performanceLogs */
  useEffect(() => {
    const perfRef = collection(db, "performanceLogs");
    const perfQuery = query(perfRef, orderBy("timestamp", "desc"), limit(20));

    const unsubscribe = onSnapshot(
      perfQuery,
      (snapshot) => {
        const fetched: PerfLogRow[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            time: formatTimestamp(data.timestamp),
            event: data.event ?? "Unknown event",
            value: data.value ?? "—",
            status: (data.status ?? "Normal") as
              | "Normal"
              | "Watch"
              | "Critical",
          };
        });
        setPerfLogs(fetched);
        setPerfLoading(false);
      },
      (error) => {
        console.error("Error fetching performanceLogs:", error);
        setPerfLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* Real-time listener: errorLogs */
  useEffect(() => {
    const errRef = collection(db, "errorLogs");
    const errQuery = query(errRef, orderBy("timestamp", "desc"), limit(20));

    const unsubscribe = onSnapshot(
      errQuery,
      (snapshot) => {
        const fetched: ErrorLogRow[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            time: formatTimestamp(data.timestamp),
            severity: (data.severity ?? "Warning") as
              | "Warning"
              | "Error"
              | "Critical",
            service: data.service ?? "Unknown",
            description: data.description ?? "",
            status: (data.status ?? "Resolved") as
              | "Resolved"
              | "Open"
              | "Investigating",
          };
        });
        setErrorLogs(fetched);
        setErrorsLoading(false);
      },
      (error) => {
        console.error("Error fetching errorLogs:", error);
        setErrorsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* Click-outside + Escape key handlers */
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

  const handleRefresh = (serviceId: string) => {
    setRefreshing(serviceId);
    setTimeout(() => {
      setServices((prev) =>
        prev.map((s) =>
          s.id === serviceId
            ? { ...s, lastChecked: formatTime(new Date()) }
            : s
        )
      );
      setRefreshing(null);
    }, 800);
  };

  return (
    <div className="it-admin-page">
      <div className="dashboard">
        {/* Sidebar */}
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

        {/* Main content */}
        <main className="main">
          <header className="main-header">
            <div>
              <h1>System Health</h1>
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
                    <p className="dropdown-role">
                      {ROLE_LABELS[currentUser.role]}
                    </p>
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

          <div className="system-health-content">
            {/* Firebase Service Health */}
            <article className="card">
              <div className="card-header-static">
                <span className="eyebrow live">Live</span>
                <h2 className="card-title-static">Firebase Service Health</h2>
              </div>

              {servicesLoading ? (
                <div className="table-loading">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading services...</p>
                </div>
              ) : (
                <table className="health-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Status</th>
                      <th>Avg response</th>
                      <th>Last checked</th>
                      <th aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id}>
                        <td className="cell-service">{s.service}</td>
                        <td>
                          <span
                            className={`health-pill ${
                              s.status === "Online"
                                ? "pill-online"
                                : s.status === "Scheduled"
                                ? "pill-scheduled"
                                : "pill-offline"
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="cell-response">{s.avgResponse}</td>
                        <td className="cell-last-checked">{s.lastChecked}</td>
                        <td className="cell-refresh">
                          <button
                            type="button"
                            className="refresh-btn"
                            onClick={() => handleRefresh(s.id)}
                            disabled={refreshing === s.id}
                            aria-label={`Refresh ${s.service}`}
                          >
                            <RefreshCw
                              size={16}
                              className={refreshing === s.id ? "spin" : ""}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            {/* Performance Log */}
            <article className="card">
              <div className="card-header-static">
                <span className="eyebrow">Today</span>
                <h2 className="card-title-static">Performance Log</h2>
              </div>

              {perfLoading ? (
                <div className="table-loading">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading performance logs...</p>
                </div>
              ) : perfLogs.length === 0 ? (
                <div className="table-empty">
                  <p>No performance logs recorded today.</p>
                </div>
              ) : (
                <table className="health-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Event</th>
                      <th>Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="cell-time">{log.time}</td>
                        <td className="cell-event">{log.event}</td>
                        <td className="cell-value">{log.value}</td>
                        <td>
                          <span
                            className={`health-pill ${
                              log.status === "Normal"
                                ? "pill-normal"
                                : log.status === "Watch"
                                ? "pill-watch"
                                : "pill-critical"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            {/* Error & Crash Log */}
            <article className="card">
              <div className="card-header-static">
                <span className="eyebrow">Last 24 hours</span>
                <h2 className="card-title-static">Error &amp; Crash Log</h2>
              </div>

              {errorsLoading ? (
                <div className="table-loading">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading error logs...</p>
                </div>
              ) : errorLogs.length === 0 ? (
                <div className="table-empty">
                  <p>No errors reported in the last 24 hours.</p>
                </div>
              ) : (
                <table className="health-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Severity</th>
                      <th>Service</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="cell-time">{log.time}</td>
                        <td>
                          <span
                            className={`health-pill ${
                              log.severity === "Warning"
                                ? "pill-warning"
                                : log.severity === "Error"
                                ? "pill-error"
                                : "pill-critical"
                            }`}
                          >
                            {log.severity}
                          </span>
                        </td>
                        <td className="cell-service-name">{log.service}</td>
                        <td className="cell-description">{log.description}</td>
                        <td>
                          <span
                            className={`health-pill ${
                              log.status === "Resolved"
                                ? "pill-resolved"
                                : log.status === "Open"
                                ? "pill-error"
                                : "pill-watch"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="cell-refresh">
                          <button
                            type="button"
                            className="row-more-btn"
                            aria-label="More options"
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            <div style={{ height: 24 }} />
          </div>
        </main>
      </div>
    </div>
  );
}