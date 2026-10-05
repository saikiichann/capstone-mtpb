import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ChevronDown, Calendar } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  limit,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ExportCenter.css";

// Asset imports
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import pendingPaymentsIcon from "../../assets/pendingpayments.png";
import paymentVerificationIcon from "../../assets/paymentverification.png";
import transactionIcon from "../../assets/transaction.png";
import revenueIcon from "../../assets/revenue.png";
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

type DataType =
  | "Transactions"
  | "Revenue"
  | "Release Log";

type ExportFormat = "CSV" | "Excel";

type ExportLogRow = {
  id: string;
  fileName: string;
  timestamp: Timestamp | null;
  relativeTime: string;
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

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const DATA_TYPE_OPTIONS: DataType[] = [
  "Transactions",
  "Revenue",
  "Release Log",
];

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
      { label: "Overview", icon: overviewIcon, path: "/finance" },
    ],
  },
  {
    label: "Payment/Finance",
    items: [
      { label: "Pending Payments", icon: pendingPaymentsIcon, path: "/finance/pending" },
      { label: "Payment Verification", icon: paymentVerificationIcon, path: "/finance/verification" },
      { label: "Transaction History", icon: transactionIcon, path: "/finance/transactions" },
      { label: "Revenue Reports", icon: revenueIcon, path: "/finance/revenue" },
    ],
  },

  {
    label: "Reports",
    items: [
      { label: "All Reports", icon: allReportsIcon, path: "/finance/reports" },
      { label: "Export Center", icon: exportCenterIcon, path: "/finance/export", active: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
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

const formatRelativeTime = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    const date = ts.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
  } catch {
    return "—";
  }
};

const slugifyDataType = (dataType: DataType): string => {
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
    role: "finance",
  });

  const defaultRange = getDefaultDateRange();
  const [dataType, setDataType] = useState<DataType | "">("");
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState("");

  const [recentExports, setRecentExports] = useState<ExportLogRow[]>([]);
  const [loadingExports, setLoadingExports] = useState(true);

  // -----------------------------------------------------------------------
  // EFFECT: Fetch current user
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "finance" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "finance") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "finance",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  // -----------------------------------------------------------------------
  // EFFECT: Real-time listener for recent exports
  // -----------------------------------------------------------------------
  useEffect(() => {
    const ref = collection(db, "exportLogs");
    const q = query(ref, orderBy("timestamp", "desc"), limit(10));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows: ExportLogRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            fileName: data.fileName ?? "export.csv",
            timestamp: data.timestamp ?? null,
            relativeTime: formatRelativeTime(data.timestamp),
          };
        });
        setRecentExports(rows);
        setLoadingExports(false);
      },
      (err) => {
        console.warn("Export logs fetch failed:", err.code);
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
      const slug = slugifyDataType(dataType);
      const startSlug = formatDateForFilename(startDate);
      const endSlug = formatDateForFilename(endDate);
      const extension = format === "CSV" ? "csv" : "xlsx";
      const fileName = `${slug}_${startSlug}_${endSlug}.${extension}`;

      // Simulate export delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Log the export to Firestore
      await addDoc(collection(db, "exportLogs"), {
        fileName,
        dataType,
        format,
        startDate,
        endDate,
        exportedBy: currentUser.name,
        timestamp: serverTimestamp(),
      });

      console.log("Export logged:", fileName);

      alert(`Export ready: ${fileName}\n\n(In production, this would download the file.)`);
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
    <div className="finance-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={mtpbLogo} alt="MTPB Logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">Finance Staff</p>
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
                alt="Staff Profile"
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
            <div className="export-layout">
              {/* EXPORT DATA FORM */}
              <div className="card export-card">
                <h2 className="export-card-title">Export Data</h2>

                {/* Data Type */}
                <div className="export-field">
                  <label htmlFor="data-type">Data Type</label>
                  <div className="select-wrap">
                    <select
                      id="data-type"
                      value={dataType}
                      onChange={(e) => setDataType(e.target.value as DataType)}
                      disabled={exporting !== null}
                    >
                      <option value="" disabled>Select Data Type</option>
                      {DATA_TYPE_OPTIONS.map((dt) => (
                        <option key={dt} value={dt}>{dt}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="select-icon" />
                  </div>
                </div>

                {/* Date Range */}
                <div className="export-field">
                  <label>Date Range</label>
                  <div className="date-range-row">
                    <div className="date-input-wrap">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        disabled={exporting !== null}
                      />
                      <Calendar size={16} className="date-icon" />
                    </div>
                    <div className="date-input-wrap">
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        disabled={exporting !== null}
                      />
                      <Calendar size={16} className="date-icon" />
                    </div>
                  </div>
                </div>

                {/* Error */}
                {error && <p className="export-error">{error}</p>}

                {/* Export buttons */}
                <div className="export-buttons">
                  <button
                    type="button"
                    className="btn-export-primary"
                    onClick={() => handleExport("CSV")}
                    disabled={exporting !== null}
                  >
                    {exporting === "CSV" ? "Exporting..." : "Export CSV"}
                  </button>
                  <button
                    type="button"
                    className="btn-export-secondary"
                    onClick={() => handleExport("Excel")}
                    disabled={exporting !== null}
                  >
                    {exporting === "Excel" ? "Exporting..." : "Export Excel"}
                  </button>
                </div>
              </div>

              {/* RECENT EXPORTS */}
              <div className="card recent-exports-card">
                <h2 className="export-card-title">Recent Exports</h2>

                {loadingExports ? (
                  <div className="table-loading">
                    <p>Loading...</p>
                  </div>
                ) : recentExports.length === 0 ? (
                  <div className="table-empty">
                    <p>No recent exports.</p>
                  </div>
                ) : (
                  <ul className="recent-list">
                    {recentExports.map((item) => (
                      <li key={item.id} className="recent-item">
                        <span className="recent-name">{item.fileName}</span>
                        <span className="recent-time">{item.relativeTime}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}