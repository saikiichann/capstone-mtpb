import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ChevronDown, Calendar } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ExportCenter.css";

// Asset imports
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import queueMonitorIcon from "../../assets/queue.png";
import allViolationsIcon from "../../assets/allviolations.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingLogIcon from "../../assets/impounding.png";
import vehicleHistoryIcon from "../../assets/history.png";
import releaseRequestsIcon from "../../assets/releaserequest.png";
import releaseOrdersIcon from "../../assets/releaseorder.png";
import releaseLogIcon from "../../assets/releaselog.png";
import allReportsIcon from "../../assets/reports.png";
import exportCenterIcon from "../../assets/export.png";
import logoutIcon from "../../assets/logout.png";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
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

type RecentExport = {
  id: string;
  filename: string;
  timeAgo: string;
};

type NavItem = {
  label: string;
  icon: string;
  path: string;
  active?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type ExportFormat = "CSV" | "Excel";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const ROLE_LABELS: Record<RoleSlug, string> = {
  "oic": "Officer in Charge",
  "it-admin": "IT Admin",
  "supervisor": "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  "finance": "Finance Staff",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/record-officer" },
      { label: "Queue Monitor", icon: queueMonitorIcon, path: "/record-officer/queue" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "All Violations", icon: allViolationsIcon, path: "/record-officer/violations" },
      { label: "Clamping Log", icon: clampingIcon, path: "/record-officer/clamping" },
      { label: "Impounding Log", icon: impoundingLogIcon, path: "/record-officer/impounding" },
      { label: "Vehicle History", icon: vehicleHistoryIcon, path: "/record-officer/vehicle-history" },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      { label: "Release Requests", icon: releaseRequestsIcon, path: "/record-officer/release-requests" },
      { label: "Release Orders", icon: releaseOrdersIcon, path: "/record-officer/release-orders" },
      { label: "Release Log", icon: releaseLogIcon, path: "/record-officer/release-log" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "All Reports", icon: allReportsIcon, path: "/record-officer/reports" },
      { label: "Export Center", icon: exportCenterIcon, path: "/record-officer/export", active: true },
    ],
  },
];

const DATA_TYPES = [
  "Violations",
  "Clamping Log",
  "Impounding Log",
  "Release Log",
] as const;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const formatTimeAgo = (timestamp: Timestamp | null): string => {
  if (!timestamp) return "—";
  try {
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
  } catch {
    return "—";
  }
};

const getDefaultDateRange = (): { start: string; end: string } => {
  const today = new Date();
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(today.getDate() - 5);

  const format = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return {
    start: format(fiveDaysAgo),
    end: format(today),
  };
};

const slugifyDataType = (dataType: string): string => {
  return dataType.toLowerCase().replace(/\s+/g, "_");
};

const formatDateForFilename = (dateStr: string): string => {
  try {
    const [, m, d] = dateStr.split("-");
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return `${monthNames[parseInt(m, 10) - 1]}${parseInt(d, 10)}`;
  } catch {
    return "unknown";
  }
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function ExportCenter() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  // Form State
  const defaultRange = getDefaultDateRange();
  const [dataType, setDataType] = useState<string>("");
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState("");

  // Recent Exports State (from Firestore)
  const [recentExports, setRecentExports] = useState<RecentExport[]>([]);
  const [loadingExports, setLoadingExports] = useState(true);

  // -----------------------------------------------------------------------
  // EFFECT: Fetch current user
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "record-officer" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "record-officer") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "record-officer",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  // -----------------------------------------------------------------------
  // EFFECT: Real-time listener for Recent Exports
  // -----------------------------------------------------------------------
  useEffect(() => {
    const ref = collection(db, "exports");
    const q = query(ref, orderBy("createdAt", "desc"), limit(10));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: RecentExport[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            filename: data.filename ?? "—",
            timeAgo: formatTimeAgo(data.createdAt ?? null),
          };
        });
        setRecentExports(fetched);
        setLoadingExports(false);
      },
      (err) => {
        console.warn("Recent exports fetch failed:", err.code);
        setLoadingExports(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // -----------------------------------------------------------------------
  // EFFECT: Click-outside for dropdown
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -----------------------------------------------------------------------
  // HANDLERS
  // -----------------------------------------------------------------------
  const handleLogout = async () => {
    try {
      await firebaseSignOut(auth);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.clear();
      setIsMenuOpen(false);
      navigate("/");
    } catch (err) {
      console.error("Logout error:", err);
      setIsMenuOpen(false);
      navigate("/");
    }
  };

  const handleChangePassword = () => {
    console.log("Navigating to Change Password...");
    setIsMenuOpen(false);
  };

  const handleExport = async (format: ExportFormat) => {
    setError("");

    if (!dataType) {
      setError("Please select a data type.");
      return;
    }

    if (!startDate || !endDate) {
      setError("Please select a date range.");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError("Start date must be before end date.");
      return;
    }

    setExporting(format);

    try {
      // Build filename
      const slug = slugifyDataType(dataType);
      const startSlug = formatDateForFilename(startDate);
      const endSlug = formatDateForFilename(endDate);
      const extension = format === "CSV" ? "csv" : "xlsx";
      const filename = `${slug}_${startSlug}_${endSlug}.${extension}`;

      // Simulate export delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Log the export to Firestore
      await addDoc(collection(db, "exports"), {
        filename,
        dataType,
        format,
        startDate,
        endDate,
        exportedBy: currentUser.name,
        createdAt: serverTimestamp(),
      });

      console.log("Export logged:", filename);
      alert(`Export ready: ${filename}\n\n(In production, this would download the file.)`);
    } catch (err: any) {
      console.error("Export error:", err);
      if (err.code === "permission-denied") {
        setError("Permission denied. Please check your Firestore rules.");
      } else {
        setError(err.message || "Failed to export data.");
      }
    } finally {
      setExporting(null);
    }
  };

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <div className="record-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={mtpbLogo} alt="MTPB Logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">Record Officer</p>
            </div>
          </div>

          <nav className="sidebar-nav">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="nav-group">
                <p className="nav-group-label">{group.label}</p>
                <ul className="nav-list">
                  {group.items.map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        className={`nav-item ${item.active ? "nav-item-active" : ""}`}
                        onClick={() => navigate(item.path)}
                      >
                        <img src={item.icon} alt="" className="nav-icon" />
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <div className="main">
          <header className="main-header">
            <div>
              <h1>Export Center</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            <div className="avatar-container" ref={dropdownRef}>
              <img
                src={officerAvatar}
                alt="Officer Profile"
                className="avatar-img"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              />

              {isMenuOpen && (
                <div className="profile-dropdown">
                  <div className="dropdown-header">
                    <p className="dropdown-name">{currentUser.name}</p>
                    <p className="dropdown-role">
                      {ROLE_LABELS[currentUser.role]}
                    </p>
                  </div>
                  <button className="dropdown-item" onClick={handleChangePassword}>
                    <KeyRound size={18} />
                    <span>Change Password</span>
                  </button>
                  <button className="dropdown-item logout" onClick={handleLogout}>
                    <img src={logoutIcon} alt="" className="dropdown-icon" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="main-content">
            <div className="export-grid">
              {/* EXPORT DATA CARD */}
              <div className="export-card">
                <h2 className="export-title">Export Data</h2>

                {/* Data Type */}
                <div className="export-form-group">
                  <label htmlFor="dataType">Data Type</label>
                  <div className="select-wrapper">
                    <select
                      id="dataType"
                      className={`export-select ${!dataType ? "placeholder" : ""}`}
                      value={dataType}
                      onChange={(e) => setDataType(e.target.value)}
                      disabled={exporting !== null}
                    >
                      <option value="" disabled hidden>Select Data Type</option>
                      {DATA_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={18} className="select-chevron" />
                  </div>
                </div>

                {/* Date Range */}
                <div className="export-form-group">
                  <label>Date Range</label>
                  <div className="date-range-row">
                    <div className="date-input-wrapper">
                      <input
                        type="date"
                        className="date-input"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        disabled={exporting !== null}
                      />
                      <Calendar size={16} className="calendar-icon" />
                    </div>
                    <div className="date-input-wrapper">
                      <input
                        type="date"
                        className="date-input"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        disabled={exporting !== null}
                      />
                      <Calendar size={16} className="calendar-icon" />
                    </div>
                  </div>
                </div>

                {/* Error */}
                {error && <p className="export-error">{error}</p>}

                {/* Export Buttons */}
                <div className="export-actions">
                  <button
                    type="button"
                    className="btn-export-csv"
                    onClick={() => handleExport("CSV")}
                    disabled={exporting !== null}
                  >
                    {exporting === "CSV" ? "Exporting..." : "Export CSV"}
                  </button>
                  <button
                    type="button"
                    className="btn-export-excel"
                    onClick={() => handleExport("Excel")}
                    disabled={exporting !== null}
                  >
                    {exporting === "Excel" ? "Exporting..." : "Export Excel"}
                  </button>
                </div>
              </div>

              {/* RECENT EXPORTS CARD */}
              <div className="recent-card">
                <h2 className="recent-title">Recent Exports</h2>

                {loadingExports ? (
                  <p className="recent-empty">Loading exports...</p>
                ) : recentExports.length === 0 ? (
                  <p className="recent-empty">No recent exports yet.</p>
                ) : (
                  <div className="recent-list">
                    {recentExports.map((item) => (
                      <div key={item.id} className="recent-item">
                        <span className="recent-filename">{item.filename}</span>
                        <span className="recent-time">{item.timeAgo}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}