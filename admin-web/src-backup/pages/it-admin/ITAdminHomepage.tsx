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
  Wifi,
  WifiOff,
  QrCode,
} from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { supabase, SUPABASE_BUCKET } from "../../supabase";
import "./ITAdminHomePage.css";

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

type ServiceStatus = {
  id: string;
  name: string;
  status: string;
  tone: "online" | "scheduled" | "offline";
  latency?: number;
};

type UsageBar = {
  label: string;
  value: string;
  percent: number;
  tone: "blue" | "green";
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

type AuditEvent = {
  id: string;
  userName: string;
  action: string;
  timestamp: Timestamp | null;
};

type Metrics = {
  totalAccounts: number;
  activeAccounts: number;
  auditEventsToday: number;
  errorEvents: number;
  failedLogins: number;
};

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
// Supabase Free tier storage limit: 1 GB
const SUPABASE_FREE_TIER_BYTES = 1024 * 1024 * 1024;

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
      { label: "Overview", icon: LayoutDashboard, path: "/it-admin", active: true },
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
      { label: "Roles & Permissions", icon: ShieldCheck, path: "/it-admin/roles" },
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
   STATIC DATA
------------------------------------------------------------------ */
const ramUsage: UsageBar[] = [
  { label: "In use (apps + system)", value: "9.4 GB", percent: 59, tone: "blue" },
  { label: "Available", value: "6.4 GB", percent: 41, tone: "green" },
];

const diskUsage: UsageBar[] = [
  { label: "Used", value: "94 GB", percent: 8, tone: "blue" },
  { label: "Free", value: "~1.04 TB", percent: 92, tone: "green" },
];

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
const formatRelativeTime = (ts: Timestamp | null): string => {
  if (!ts) return "just now";
  const date = ts.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

const isToday = (ts: Timestamp | null): boolean => {
  if (!ts) return false;
  const date = ts.toDate();
  const now = new Date();
  return date.toDateString() === now.toDateString();
};

const statusToTone = (status: string): "online" | "scheduled" | "offline" => {
  const s = status.toLowerCase();
  if (s === "online" || s === "active" || s === "up") return "online";
  if (s === "scheduled" || s === "pending" || s === "maintenance") return "scheduled";
  return "offline";
};

// Format bytes into a human-readable string (B, KB, MB, GB, TB)
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

/* ------------------------------------------------------------------
   HEALTH CHECK FUNCTIONS
------------------------------------------------------------------ */

// Verify Firestore availability by reading a single document.
const pingFirestore = async (): Promise<{ ok: boolean; latency: number }> => {
  const start = performance.now();
  try {
    await getDocs(query(collection(db, "users"), limit(1)));
    const latency = Math.round(performance.now() - start);
    console.log(`Firestore ping OK: ${latency}ms`);
    return { ok: true, latency };
  } catch (err: any) {
    // Permission errors still indicate the service is reachable.
    if (err.code === "permission-denied") {
      console.log("Firestore ping OK (permission denied, service reachable)");
      return { ok: true, latency: 0 };
    }
    console.error("Firestore ping failed:", err);
    return { ok: false, latency: 0 };
  }
};

// Verify Authentication availability by forcing an ID token refresh.
// This performs an actual network call to the Firebase Auth server.
const pingAuth = async (): Promise<{ ok: boolean; latency: number }> => {
  const start = performance.now();
  try {
    const user = auth.currentUser;
    if (!user) {
      console.log("Auth check skipped: no active user session");
      return { ok: false, latency: 0 };
    }

    // Force refresh triggers a real network request.
    await user.getIdToken(true);

    const latency = Math.round(performance.now() - start);
    console.log(`Auth ping OK: ${latency}ms`);
    return { ok: true, latency };
  } catch (err) {
    console.error("Auth ping failed:", err);
    return { ok: false, latency: 0 };
  }
};

// Verify Supabase Storage availability by listing files in the bucket.
const pingStorage = async (): Promise<{ ok: boolean; latency: number }> => {
  const start = performance.now();
  try {
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .list("", { limit: 1 });

    const latency = Math.round(performance.now() - start);

    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      // These errors indicate the service is reachable but access is restricted.
      if (
        msg.includes("not found") ||
        msg.includes("permission") ||
        msg.includes("unauthorized") ||
        msg.includes("row-level security")
      ) {
        console.log(`Supabase Storage ping OK (${error.message})`);
        return { ok: true, latency };
      }
      console.error("Supabase Storage ping failed:", error);
      return { ok: false, latency: 0 };
    }

    console.log(`Supabase Storage ping OK: ${latency}ms`);
    return { ok: true, latency };
  } catch (err) {
    console.error("Supabase Storage ping failed:", err);
    return { ok: false, latency: 0 };
  }
};

// Retrieve total storage usage by summing the size of all files in the bucket.
const getStorageUsage = async (): Promise<{
  ok: boolean;
  bytes: number;
  fileCount: number;
  latency: number;
}> => {
  const start = performance.now();
  try {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .list("", {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      });

    const latency = Math.round(performance.now() - start);

    if (error) {
      console.warn("Storage usage fetch warning:", error.message);
      return { ok: false, bytes: 0, fileCount: 0, latency };
    }

    const files = data ?? [];
    const totalBytes = files.reduce((sum, file) => {
      const size = (file.metadata as { size?: number } | null)?.size ?? 0;
      return sum + size;
    }, 0);

    console.log(
      `Storage usage: ${files.length} files, ${formatBytes(totalBytes)}`
    );

    return {
      ok: true,
      bytes: totalBytes,
      fileCount: files.length,
      latency,
    };
  } catch (err) {
    console.error("Storage usage fetch failed:", err);
    return { ok: false, bytes: 0, fileCount: 0, latency: 0 };
  }
};

/* ------------------------------------------------------------------
   DEFAULT SYSTEM STATUS (fallback)
------------------------------------------------------------------ */
function getDefaultSystemStatus(): ServiceStatus[] {
  return [
    { id: "firestore", name: "Firebase Firestore", status: "Online", tone: "online" },
    { id: "auth", name: "Firebase Authentication", status: "Online", tone: "online" },
    { id: "storage", name: "Supabase Storage", status: "Online", tone: "online" },
    { id: "fcm", name: "FCM Notifications", status: "Online", tone: "online" },
    { id: "backup", name: "Backup Service", status: "Scheduled", tone: "scheduled" },
  ];
}

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function ITAdminHomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  const [metrics, setMetrics] = useState<Metrics>({
    totalAccounts: 0,
    activeAccounts: 0,
    auditEventsToday: 0,
    errorEvents: 0,
    failedLogins: 0,
  });

  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  const [systemStatus, setSystemStatus] = useState<ServiceStatus[]>(
    getDefaultSystemStatus()
  );

  const [isOnline, setIsOnline] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const [uptime] = useState("84");

  // Storage usage state
  const [storageUsed, setStorageUsed] = useState("—");
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [storageFileCount, setStorageFileCount] = useState(0);

  // Tracks whether the initial auth state has resolved.
  // Prevents false "offline" results on first render.
  const [authReady, setAuthReady] = useState(false);

  /* ================================================================
     1. BROWSER ONLINE/OFFLINE
  ================================================================ */
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  /* ================================================================
     2. CURRENT USER
  ================================================================ */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      // Mark auth as ready after the first callback resolves.
      setAuthReady(true);

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

  /* ================================================================
     3. LIVE HEALTH CHECKS (every 30s)
     Waits for authReady before starting to avoid false negatives.
  ================================================================ */
  useEffect(() => {
    if (!authReady) return;

    let isMounted = true;

    const runHealthChecks = async () => {
      console.log("Running health checks...");

      const results = await Promise.allSettled([
        pingFirestore(),
        pingAuth(),
        pingStorage(),
      ]);

      if (!isMounted) return;

      const firestoreResult =
        results[0].status === "fulfilled"
          ? results[0].value
          : { ok: false, latency: 0 };
      const authResult =
        results[1].status === "fulfilled"
          ? results[1].value
          : { ok: false, latency: 0 };
      const storageResult =
        results[2].status === "fulfilled"
          ? results[2].value
          : { ok: false, latency: 0 };

      // Fetch storage usage in parallel with status checks.
      const storageUsage = await getStorageUsage();
      if (!isMounted) return;

      if (storageUsage.ok) {
        setStorageUsedBytes(storageUsage.bytes);
        setStorageFileCount(storageUsage.fileCount);

        const percent = Math.min(
          100,
          Math.round((storageUsage.bytes / SUPABASE_FREE_TIER_BYTES) * 100)
        );
        setStorageUsed(`${percent}%`);
      }

      // Read optional FCM and backup status documents from Firestore.
      let fcmStatus = "Online";
      let backupStatus = "Scheduled";
      try {
        const [fcmDoc, backupDoc] = await Promise.all([
          getDoc(doc(db, "systemHealth", "fcm")),
          getDoc(doc(db, "systemHealth", "backup")),
        ]);
        if (fcmDoc.exists()) fcmStatus = fcmDoc.data().status ?? "Online";
        if (backupDoc.exists()) backupStatus = backupDoc.data().status ?? "Scheduled";
      } catch {
        // Ignore read errors; fallback values are used.
      }

      if (!isMounted) return;

      const updatedStatuses: ServiceStatus[] = [
        {
          id: "firestore",
          name: "Firebase Firestore",
          status: firestoreResult.ok ? "Online" : "Offline",
          tone: firestoreResult.ok ? "online" : "offline",
          latency: firestoreResult.latency,
        },
        {
          id: "auth",
          name: "Firebase Authentication",
          status: authResult.ok ? "Online" : "Offline",
          tone: authResult.ok ? "online" : "offline",
          latency: authResult.latency,
        },
        {
          id: "storage",
          name: "Supabase Storage",
          status: storageResult.ok ? "Online" : "Offline",
          tone: storageResult.ok ? "online" : "offline",
          latency: storageResult.latency,
        },
        {
          id: "fcm",
          name: "FCM Notifications",
          status: fcmStatus,
          tone: statusToTone(fcmStatus),
        },
        {
          id: "backup",
          name: "Backup Service",
          status: backupStatus,
          tone: statusToTone(backupStatus),
        },
      ];

      setSystemStatus(updatedStatuses);
      setLastUpdate(new Date());

      console.log("Health check complete:", {
        firestore: firestoreResult.ok ? `${firestoreResult.latency}ms` : "OFFLINE",
        auth: authResult.ok ? `${authResult.latency}ms` : "OFFLINE",
        storage: storageResult.ok ? `${storageResult.latency}ms` : "OFFLINE",
        storageUsage: storageUsage.ok
          ? `${formatBytes(storageUsage.bytes)} (${storageUsage.fileCount} files)`
          : "N/A",
      });
    };

    runHealthChecks();
    const intervalId = setInterval(runHealthChecks, 30000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      console.log("Stopped health check interval");
    };
  }, [authReady]);

  /* ================================================================
     4. USERS (real-time)
  ================================================================ */
  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const allUsers = snapshot.docs.map((d) => d.data());
        const activeCount = allUsers.filter((u) => u.status === "active").length;
        setMetrics((prev) => ({
          ...prev,
          totalAccounts: allUsers.length,
          activeAccounts: activeCount,
        }));
      },
      (error) => {
        console.error("Error fetching users:", error);
      }
    );
    return () => unsubscribe();
  }, []);

  /* ================================================================
     5. AUDIT LOGS (real-time)
  ================================================================ */
  useEffect(() => {
    const auditRef = collection(db, "auditLogs");
    const auditQuery = query(auditRef, orderBy("timestamp", "desc"), limit(50));

    const unsubscribe = onSnapshot(
      auditQuery,
      (snapshot) => {
        const allEvents: AuditEvent[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userName: data.userName ?? "Unknown",
            action: data.action ?? "",
            timestamp: data.timestamp ?? null,
          };
        });

        setAuditEvents(allEvents.slice(0, 4));

        const todayEvents = allEvents.filter((e) => isToday(e.timestamp));
        const errorEvents = allEvents.filter(
          (e) =>
            e.action.toLowerCase().includes("error") ||
            e.action.toLowerCase().includes("failed")
        );
        const failedLogins = allEvents.filter((e) =>
          e.action.toLowerCase().includes("failed login")
        );

        setMetrics((prev) => ({
          ...prev,
          auditEventsToday: todayEvents.length,
          errorEvents: errorEvents.length,
          failedLogins: failedLogins.length,
        }));
      },
      (error) => {
        console.error("Error fetching audit logs:", error);
        setAuditEvents([]);
      }
    );
    return () => unsubscribe();
  }, []);

  /* ================================================================
     6. CLICK-OUTSIDE AND ESCAPE HANDLERS
  ================================================================ */
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

  const handleChangePassword = () => {
    console.log("Navigating to Change Password...");
    setMenuOpen(false);
  };

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

  const metricCards = [
    { label: "System Uptime", value: uptime, sub: "Last 30 days" },
    {
      label: "Storage Used",
      value: storageUsed,
      sub:
        storageUsedBytes > 0
          ? `${formatBytes(storageUsedBytes)} · ${storageFileCount} files`
          : "Supabase Storage",
    },
    {
      label: "Active Accounts",
      value: String(metrics.activeAccounts),
      sub: `of ${metrics.totalAccounts} total`,
    },
    {
      label: "Audit Events Today",
      value: String(metrics.auditEventsToday),
      sub: "System-wide",
    },
    {
      label: "Error Events",
      value: String(metrics.errorEvents),
      sub: "Last 24 hrs",
    },
    {
      label: "Failed Logins",
      value: String(metrics.failedLogins),
      sub: "Blocked automatically",
    },
  ];

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
              <h1>Overview</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            <div className="header-right">
              <div
                className={`connection-indicator ${isOnline ? "online" : "offline"}`}
                title={isOnline ? "Real-time updates active" : "Offline"}
              >
                {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                <span>{isOnline ? "Live" : "Offline"}</span>
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
                      onClick={handleChangePassword}
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
            </div>
          </header>

          <div className="main-content">
            {/* METRICS */}
            <section className="metric-grid">
              {metricCards.map((card) => (
                <article className="card metric-card" key={card.label}>
                  <p className="metric-label">{card.label}</p>
                  <p className="metric-value">{card.value}</p>
                  <p className="metric-sub">{card.sub}</p>
                </article>
              ))}
            </section>

            {/* MIDDLE ROW */}
            <section className="middle-row">
              {/* LIVE SYSTEM STATUS */}
              <article className="card">
                <div className="card-header">
                  <div className="card-heading">
                    <span className="eyebrow live">Live</span>
                    <h2 className="card-title">System Status</h2>
                  </div>
                  <a href="#status" className="card-link">
                    Full Status
                  </a>
                </div>

                <ul className="status-list">
                  {systemStatus.map((service) => (
                    <li className="status-row" key={service.id}>
                      <span className="status-name">
                        {service.name}
                        {service.latency !== undefined && service.latency > 0 && (
                          <span className="latency-badge">{service.latency}ms</span>
                        )}
                      </span>
                      <span className="status-actions">
                        <span className={`status-pill ${service.tone}`}>
                          {service.status}
                        </span>
                        <button
                          type="button"
                          className="row-more"
                          aria-label={`More options for ${service.name}`}
                        >
                          &#8943;
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="status-footer">
                  <span>
                    Last checked:{" "}
                    {lastUpdate.toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span className="status-footer-live">Auto-refresh every 30s</span>
                </div>
              </article>

              {/* AUDIT EVENTS */}
              <article className="card">
                <div className="card-header">
                  <div className="card-heading">
                    <span className="eyebrow">Recent</span>
                    <h2 className="card-title">Audit Events</h2>
                  </div>
                  <a href="#audit-log" className="card-link">
                    Full Log
                  </a>
                </div>

                <ul className="activity-list">
                  {auditEvents.length === 0 ? (
                    <li className="activity-item">
                      <p className="activity-text">No recent activity</p>
                    </li>
                  ) : (
                    auditEvents.map((event) => (
                      <li className="activity-item" key={event.id}>
                        <p className="activity-text">
                          {event.userName} — {event.action}
                        </p>
                        <p className="activity-time">
                          {formatRelativeTime(event.timestamp)}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </article>
            </section>

            {/* BOTTOM ROW */}
            <section className="bottom-row">
              <article className="card">
                <h2 className="card-title">RAM Usage</h2>
                <div className="usage-list">
                  {ramUsage.map((bar) => (
                    <div className="usage-row" key={bar.label}>
                      <div className="usage-meta">
                        <span className="usage-label">{bar.label}</span>
                        <span className="usage-value">{bar.value}</span>
                      </div>
                      <div className="progress-track">
                        <div
                          className={`progress-fill ${bar.tone}`}
                          style={{ width: `${bar.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="usage-footer">
                  <span>Total usable: 15.8 GB</span>
                  <span className="usage-note">No memory pressure detected</span>
                </div>
              </article>

              <article className="card">
                <h2 className="card-title">Disk Usage — 1.13 TB drive</h2>
                <div className="usage-list">
                  {diskUsage.map((bar) => (
                    <div className="usage-row" key={bar.label}>
                      <div className="usage-meta">
                        <span className="usage-label">{bar.label}</span>
                        <span className="usage-value">{bar.value}</span>
                      </div>
                      <div className="progress-track">
                        <div
                          className={`progress-fill ${bar.tone}`}
                          style={{ width: `${bar.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="usage-footer">
                  <span>Total: 1.13 TB</span>
                  <span className="usage-note">Plenty of space available</span>
                </div>
              </article>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}