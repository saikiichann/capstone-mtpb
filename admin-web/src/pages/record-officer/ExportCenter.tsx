import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  ChevronDown,
  Calendar,
  ArrowRight,
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  query,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { auth, db } from "../../firebase";
import "./ExportCenter.css";

// Asset imports
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import allViolationsIcon from "../../assets/allviolations.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingLogIcon from "../../assets/impounding.png";
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

type CurrentUser = { name: string; role: RoleSlug };

type RecentExport = {
  id: string;
  filename: string;
  fileType: "csv" | "xlsx" | "pdf" | "other";
  timeAgo: string;
  timestamp: Timestamp | null;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

type ExportFormat = "CSV" | "Excel" | "PDF";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const ROLE_LABELS: Record<RoleSlug, string> = {
  oic: "Officer in Charge",
  "it-admin": "IT Admin",
  supervisor: "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  finance: "Finance Staff",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/record-officer" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "All Violations", icon: allViolationsIcon, path: "/record-officer/violations" },
      { label: "Clamping Log", icon: clampingIcon, path: "/record-officer/clamping" },
      { label: "Impounding Log", icon: impoundingLogIcon, path: "/record-officer/impounding" },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
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

const DATA_TYPE_CONFIG: Record<
  string,
  { collection: string; filterField?: string; filterValue?: string }
> = {
  Violations: { collection: "violations" },
  "Clamping Log": {
    collection: "violations",
    filterField: "enforcementType",
    filterValue: "clamped",
  },
  "Impounding Log": {
    collection: "violations",
    filterField: "enforcementType",
    filterValue: "impounded",
  },
  "Release Log": { collection: "releaseLog" },
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const formatTimeAgo = (timestamp: Timestamp | null): string => {
  if (!timestamp) return "—";
  try {
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
  } catch {
    return "—";
  }
};

const getFileType = (filename: string): "csv" | "xlsx" | "pdf" | "other" => {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "pdf") return "pdf";
  return "other";
};

const getFileTypeLabel = (type: "csv" | "xlsx" | "pdf" | "other"): string => {
  if (type === "csv") return "CSV";
  if (type === "xlsx") return "XLS";
  if (type === "pdf") return "PDF";
  return "FILE";
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

  return { start: format(fiveDaysAgo), end: format(today) };
};

const slugifyDataType = (dataType: string): string =>
  dataType.toLowerCase().replace(/\s+/g, "_");

const formatDateForFilename = (dateStr: string): string => {
  try {
    const [, m, d] = dateStr.split("-");
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return `${monthNames[parseInt(m, 10) - 1]}${parseInt(d, 10)}`;
  } catch {
    return "unknown";
  }
};

const sanitizeData = (data: any[]): Record<string, any>[] => {
  return data.map((item) => {
    const out: Record<string, any> = {};
    Object.keys(item).forEach((key) => {
      const value = item[key];
      if (value instanceof Timestamp) {
        out[key] = value.toDate().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
      } else if (value === null || value === undefined) {
        out[key] = "";
      } else if (typeof value === "object") {
        out[key] = JSON.stringify(value);
      } else {
        out[key] = value;
      }
    });
    return out;
  });
};

const filterByDateRange = (
  data: any[],
  startDate: string,
  endDate: string,
  timestampField: string = "recordedAt"
): any[] => {
  if (!startDate || !endDate) return data;

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  return data.filter((item) => {
    const ts = item[timestampField];
    if (!(ts instanceof Timestamp)) return true;
    try {
      const date = ts.toDate();
      return date >= start && date <= end;
    } catch {
      return true;
    }
  });
};

// ---------------------------------------------------------------------------
// EXPORT FUNCTIONS (unchanged logic)
// ---------------------------------------------------------------------------
const downloadCsv = (
  filename: string,
  rows: Record<string, any>[]
): void => {
  if (rows.length === 0) {
    alert("Walang data na ma-export para sa napiling date range.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const value = row[h];
          if (value === null || value === undefined) return "";
          const str = String(value);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const downloadExcel = (
  filename: string,
  rows: Record<string, any>[]
): void => {
  if (rows.length === 0) {
    alert("Walang data na ma-export para sa napiling date range.");
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);

  const columnWidths = Object.keys(rows[0]).map((key) => {
    const maxLength = Math.max(
      key.length,
      ...rows.map((row) => String(row[key] ?? "").length)
    );
    return { wch: Math.min(maxLength + 2, 50) };
  });
  worksheet["!cols"] = columnWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
  XLSX.writeFile(workbook, filename);
};

const downloadPdf = (
  filename: string,
  rows: Record<string, any>[],
  title: string,
  metadata: { exportedBy: string; dateRange: string }
): void => {
  if (rows.length === 0) {
    alert("Walang data na ma-export para sa napiling date range.");
    return;
  }

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const headerHeight = 90;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, headerHeight, "F");

  doc.setFillColor(29, 78, 216);
  doc.rect(0, headerHeight, pageWidth, 4, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("MTPB", 40, 42);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 210, 230);
  doc.text("Manila Traffic and Parking Bureau", 40, 58);
  doc.text("Integrated Enforcement System", 40, 72);

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), pageWidth - 40, 48, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 210, 230);
  doc.text(
    `Date Range: ${metadata.dateRange}`,
    pageWidth - 40,
    66,
    { align: "right" }
  );
  doc.text(
    `Exported by: ${metadata.exportedBy}`,
    pageWidth - 40,
    80,
    { align: "right" }
  );

  const cardY = headerHeight + 24;
  const cardHeight = 56;
  const cardGap = 12;
  const cardWidth = (pageWidth - 80 - cardGap * 3) / 4;

  const totalRecords = rows.length;
  const verifiedCount = rows.filter(
    (r) => String(r.paymentStatus).toLowerCase() === "verified"
  ).length;
  const totalFines = rows.reduce(
    (sum, r) => sum + (Number(r.fineAmount) || 0),
    0
  );

  const summaryCards = [
    { label: "Total Records", value: String(totalRecords) },
    { label: "Verified Payments", value: String(verifiedCount) },
    { label: "Total Fines", value: `PHP ${totalFines.toLocaleString()}` },
    {
      label: "Generated",
      value: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    },
  ];

  summaryCards.forEach((card, i) => {
    const x = 40 + i * (cardWidth + cardGap);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 6, 6, "FD");

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(card.label.toUpperCase(), x + 12, cardY + 20);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(card.value, x + 12, cardY + 42);
  });

  const columns = [
    { key: "cin", label: "CIN", width: 90 },
    { key: "plateNo", label: "PLATE NO.", width: 70 },
    { key: "violationType", label: "VIOLATION", width: 100 },
    { key: "location", label: "LOCATION", width: 110 },
    { key: "officer", label: "OFFICER", width: 80 },
    { key: "recordedAt", label: "RECORDED", width: 90 },
    { key: "fineAmount", label: "FINE", width: 55 },
    { key: "paymentStatus", label: "PAYMENT", width: 65 },
    { key: "releaseStatus", label: "RELEASE", width: 70 },
  ];

  const headers = columns.map((c) => c.label);
  const body = rows.map((row) =>
    columns.map((c) => {
      const value = row[c.key];
      if (value === null || value === undefined) return "";
      if (c.key === "fineAmount") {
        const num = Number(value);
        return isNaN(num) ? String(value) : num.toLocaleString();
      }
      return String(value);
    })
  );

  autoTable(doc, {
    head: [headers],
    body: body,
    startY: cardY + cardHeight + 20,
    theme: "plain",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 8, right: 6, bottom: 8, left: 6 },
      overflow: "linebreak",
      textColor: [51, 65, 85],
      lineColor: [241, 245, 249],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
      cellPadding: { top: 10, right: 6, bottom: 10, left: 6 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    bodyStyles: {
      lineWidth: { bottom: 0.3 },
      lineColor: [226, 232, 240],
    },
    margin: { left: 40, right: 40 },
    columnStyles: columns.reduce(
      (acc, col, idx) => ({
        ...acc,
        [idx]: { cellWidth: col.width },
      }),
      {}
    ),
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(40, pageHeight - 40, pageWidth - 40, pageHeight - 40);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(
        "MTPB — Integrated Enforcement System",
        40,
        pageHeight - 24
      );

      doc.text(
        `Generated ${new Date().toLocaleString("en-US")}`,
        pageWidth / 2,
        pageHeight - 24,
        { align: "center" }
      );

      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth - 40,
        pageHeight - 24,
        { align: "right" }
      );
    },
  });

  doc.save(filename);
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

  const defaultRange = getDefaultDateRange();
  const [dataType, setDataType] = useState<string>("");
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState("");

  const [recentExports, setRecentExports] = useState<RecentExport[]>([]);
  const [loadingExports, setLoadingExports] = useState(true);

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

  useEffect(() => {
    const ref = collection(db, "auditLogs");
    const q = query(ref, limit(200));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: RecentExport[] = snap.docs
          .filter((d) => d.data().type === "export")
          .map((d) => {
            const data = d.data();
            const filename = data.metadata?.filename ?? data.record ?? "—";
            return {
              id: d.id,
              filename,
              fileType: getFileType(filename),
              timeAgo: formatTimeAgo(data.timestamp ?? null),
              timestamp: (data.timestamp as Timestamp) ?? null,
            };
          })
          .sort((a, b) => {
            const at = a.timestamp?.toMillis?.() ?? 0;
            const bt = b.timestamp?.toMillis?.() ?? 0;
            return bt - at;
          })
          .slice(0, 10);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      const config = DATA_TYPE_CONFIG[dataType];
      if (!config) {
        setError("Unknown data type.");
        return;
      }

      const sourceSnap = await getDocs(collection(db, config.collection));
      let data: any[] = sourceSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      if (config.filterField && config.filterValue) {
        data = data.filter(
          (item) => item[config.filterField!] === config.filterValue
        );
      }

      data = filterByDateRange(data, startDate, endDate, "recordedAt");
      const cleaned = sanitizeData(data);

      const slug = slugifyDataType(dataType);
      const startSlug = formatDateForFilename(startDate);
      const endSlug = formatDateForFilename(endDate);
      const extension =
        format === "CSV" ? "csv" : format === "Excel" ? "xlsx" : "pdf";
      const filename = `${slug}_${startSlug}_${endSlug}.${extension}`;

      if (format === "CSV") {
        downloadCsv(filename, cleaned);
      } else if (format === "Excel") {
        downloadExcel(filename, cleaned);
      } else {
        downloadPdf(filename, cleaned, `${dataType} Report`, {
          exportedBy: currentUser.name,
          dateRange: `${startDate} to ${endDate}`,
        });
      }

      await addDoc(collection(db, "auditLogs"), {
        userName: currentUser.name,
        action: `exported ${dataType} (${cleaned.length} records) as ${format}`,
        record: filename,
        type: "export",
        metadata: {
          filename,
          dataType,
          format,
          startDate,
          endDate,
          recordCount: cleaned.length,
        },
        timestamp: serverTimestamp(),
      });

      console.log(`Export ready: ${filename} (${cleaned.length} records)`);
    } catch (err: any) {
      console.error("Export error:", err);
      if (err.code === "permission-denied") {
        setError(
          "Permission denied. Check your Firestore rules para sa source collection."
        );
      } else {
        setError(err.message || "Failed to export data.");
      }
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="record-page">
      <div className="dashboard">
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
                        className={`nav-item ${
                          item.active ? "nav-item-active" : ""
                        }`}
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

        <div className="main">
          <header className="main-header">
            <div className="export-hero-text">
              <h1>Export Center</h1>
              <p>Download reports and data in multiple formats</p>
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
                  <button
                    className="dropdown-item"
                    onClick={handleChangePassword}
                  >
                    <KeyRound size={18} />
                    <span>Change Password</span>
                  </button>
                  <button
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

          <main className="main-content">
            <div className="export-grid">
              {/* ═══════════════════════════════════════════════
                  EXPORT DATA CARD
              ═══════════════════════════════════════════════ */}
              <div className="export-card">
                <div className="card-header">
                  <span className="card-icon-badge blue">
                    <Upload size={18} />
                  </span>
                  <div className="card-header-text">
                    <h2 className="card-title">Export Data</h2>
                    <p className="card-subtitle">
                      Configure and download your report
                    </p>
                  </div>
                </div>

                <div className="export-form-group">
                  <label htmlFor="dataType">Data Type</label>
                  <div className="select-wrapper">
                    <select
                      id="dataType"
                      className={`export-select ${
                        !dataType ? "placeholder" : ""
                      }`}
                      value={dataType}
                      onChange={(e) => setDataType(e.target.value)}
                      disabled={exporting !== null}
                    >
                      <option value="" disabled hidden>
                        Select Data Type
                      </option>
                      {DATA_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={18} className="select-chevron" />
                  </div>
                </div>

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

                    <span className="date-range-arrow">
                      <ArrowRight size={16} />
                    </span>

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

                {error && <p className="export-error">{error}</p>}

                <div className="export-actions">
                  <button
                    type="button"
                    className="btn-export btn-export-csv"
                    onClick={() => handleExport("CSV")}
                    disabled={exporting !== null}
                  >
                    <FileText size={15} />
                    {exporting === "CSV" ? "Exporting..." : "Export CSV"}
                  </button>
                  <button
                    type="button"
                    className="btn-export btn-export-excel"
                    onClick={() => handleExport("Excel")}
                    disabled={exporting !== null}
                  >
                    <FileSpreadsheet size={15} />
                    {exporting === "Excel" ? "Exporting..." : "Export Excel"}
                  </button>
                  <button
                    type="button"
                    className="btn-export btn-export-pdf"
                    onClick={() => handleExport("PDF")}
                    disabled={exporting !== null}
                  >
                    <FileText size={15} />
                    {exporting === "PDF" ? "Exporting..." : "Export PDF"}
                  </button>
                </div>
              </div>

              {/* ═══════════════════════════════════════════════
                  RECENT EXPORTS CARD
              ═══════════════════════════════════════════════ */}
              <div className="recent-card">
                <div className="card-header">
                  <span className="card-icon-badge slate">
                    <Download size={18} />
                  </span>
                  <div className="card-header-text">
                    <h2 className="card-title">Recent Exports</h2>
                    <p className="card-subtitle">
                      Last 10 downloaded reports
                    </p>
                  </div>
                  {recentExports.length > 0 && (
                    <span className="card-header-count">
                      {recentExports.length}
                    </span>
                  )}
                </div>

                {loadingExports ? (
                  <p className="recent-empty">Loading exports...</p>
                ) : recentExports.length === 0 ? (
                  <div className="recent-empty">
                    <Download
                      size={32}
                      className="recent-empty-icon"
                      strokeWidth={1.5}
                    />
                    <span>No recent exports yet</span>
                  </div>
                ) : (
                  <div className="recent-list">
                    {recentExports.map((item) => (
                      <div key={item.id} className="recent-item">
                        <span
                          className={`recent-file-icon type-${item.fileType}`}
                        >
                          {getFileTypeLabel(item.fileType)}
                        </span>
                        <div className="recent-item-info">
                          <p className="recent-filename">{item.filename}</p>
                          <p className="recent-time">{item.timeAgo}</p>
                        </div>
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