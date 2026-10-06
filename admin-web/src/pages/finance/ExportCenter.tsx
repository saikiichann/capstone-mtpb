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
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  limit,
  getDocs,
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

type DataType = "Transactions" | "Revenue" | "Release Log";
type ExportFormat = "CSV" | "Excel" | "PDF";

type ExportLogRow = {
  id: string;
  fileName: string;
  fileType: "csv" | "xlsx" | "pdf" | "other";
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
    items: [{ label: "Overview", icon: overviewIcon, path: "/finance" }],
  },
  {
    label: "Payment/Finance",
    items: [
      {
        label: "Pending Payments",
        icon: pendingPaymentsIcon,
        path: "/finance/pending",
      },
      {
        label: "Payment Verification",
        icon: paymentVerificationIcon,
        path: "/finance/verification",
      },
      {
        label: "Transaction History",
        icon: transactionIcon,
        path: "/finance/transactions",
      },
      { label: "Revenue Reports", icon: revenueIcon, path: "/finance/revenue" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "All Reports", icon: allReportsIcon, path: "/finance/reports" },
      {
        label: "Export Center",
        icon: exportCenterIcon,
        path: "/finance/export",
        active: true,
      },
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

  return { start: format(fiveDaysAgo), end: format(today) };
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

// ---------------------------------------------------------------------------
// DATA TYPE CONFIG
// ---------------------------------------------------------------------------
const DATA_TYPE_CONFIG: Record<
  DataType,
  { collection: string; label: string }
> = {
  Transactions: { collection: "payments", label: "Transaction Report" },
  Revenue: { collection: "payments", label: "Revenue Report" },
  "Release Log": { collection: "releaseLog", label: "Release Log Report" },
};

// ---------------------------------------------------------------------------
// EXPORT: CSV
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

// ---------------------------------------------------------------------------
// EXPORT: Excel — 2 sheets (Summary + Data)
// ---------------------------------------------------------------------------
const downloadExcel = (
  filename: string,
  rows: Record<string, any>[],
  title: string,
  metadata: { exportedBy: string; dateRange: string }
): void => {
  if (rows.length === 0) {
    alert("Walang data na ma-export para sa napiling date range.");
    return;
  }

  const workbook = XLSX.utils.book_new();

  const totalRecords = rows.length;
  const totalAmount = rows.reduce((sum, r) => {
    const amt = Number(r.totalAmount ?? r.amount ?? r.totalPaid ?? 0);
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const summaryData = [
    ["MTPB — Manila Traffic and Parking Bureau", ""],
    ["Integrated Enforcement System", ""],
    ["", ""],
    ["Report Type", title],
    ["Date Range", metadata.dateRange],
    ["Exported by", metadata.exportedBy],
    [
      "Generated",
      new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    ],
    ["", ""],
    ["SUMMARY", ""],
    ["Total Records", totalRecords],
    ["Total Amount (PHP)", totalAmount],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 26 }, { wch: 42 }];
  summarySheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 1 } },
  ];

  if (summarySheet["B11"]) {
    summarySheet["B11"].z = "#,##0.00";
  }

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const dataSheet = XLSX.utils.json_to_sheet(rows);
  const columnWidths = Object.keys(rows[0]).map((key) => {
    const maxLength = Math.max(
      key.length,
      ...rows.map((row) => String(row[key] ?? "").length)
    );
    return { wch: Math.min(Math.max(maxLength + 2, 12), 40) };
  });
  dataSheet["!cols"] = columnWidths;
  dataSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(workbook, dataSheet, "Data");

  XLSX.writeFile(workbook, filename);
};

// ---------------------------------------------------------------------------
// EXPORT: PDF — Dark navy header + Blue accent (same as Record Officer)
// ---------------------------------------------------------------------------
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

  // ─── HEADER — Dark navy + Blue accent ───
  const headerHeight = 90;

  doc.setFillColor(15, 23, 42); // #0A2540 dark navy
  doc.rect(0, 0, pageWidth, headerHeight, "F");

  doc.setFillColor(29, 78, 216); // #1D4ED8 blue-700
  doc.rect(0, headerHeight, pageWidth, 4, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("MTPB", 40, 42);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 210, 230); // light gray-blue
  doc.text("Manila Traffic and Parking Bureau", 40, 58);
  doc.text("Integrated Enforcement System", 40, 72);

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), pageWidth - 40, 48, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 210, 230); // light gray-blue
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

  // ─── SUMMARY CARDS ───
  const cardY = headerHeight + 24;
  const cardHeight = 56;
  const cardGap = 12;
  const cardWidth = (pageWidth - 80 - cardGap * 3) / 4;

  const totalRecords = rows.length;
  const totalAmount = rows.reduce((sum, r) => {
    const amt = Number(r.totalAmount ?? r.amount ?? r.totalPaid ?? 0);
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const summaryCards = [
    { label: "Total Records", value: String(totalRecords) },
    {
      label: "Total Amount",
      value: `PHP ${totalAmount.toLocaleString()}`,
    },
    {
      label: "Report Type",
      value: title.replace(" Report", ""),
    },
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

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(10, 37, 64); // dark navy
    doc.text(card.value, x + 12, cardY + 42);
  });

  // ─── TABLE ───
  // 1. Define which keys you want to show, but don't set fixed widths yet
  const preferredColumnKeys = [
    { key: "referenceNumber", label: "REFERENCE" },
    { key: "cin", label: "CIN" },
    { key: "plateNo", label: "PLATE NO." },
    { key: "amount", label: "AMOUNT" },
    { key: "method", label: "METHOD" },
    { key: "status", label: "STATUS" },
    { key: "verifiedBy", label: "VERIFIED BY" },
    { key: "verifiedAt", label: "DATE & TIME" },
  ];

  const fallbackColumnKeys = [
    { key: "cin", label: "CIN" },
    { key: "plateNo", label: "PLATE NO." },
    { key: "location", label: "LOCATION" },
    { key: "releasedBy", label: "RELEASED BY" },
    { key: "releasedAt", label: "DATE & TIME" },
  ];

  const firstRow = rows[0];
  const hasPaymentFields = "referenceNumber" in firstRow || "amount" in firstRow;
  const baseColumns = hasPaymentFields ? preferredColumnKeys : fallbackColumnKeys;

  // 2. Calculate the "natural" width of each column based on content
  const tableMargin = 40; // left and right margins
  const availableWidth = pageWidth - (tableMargin * 2);

  const calculatedColumns = baseColumns.map((col) => {
    // Find the longest string in this column (header or data)
    let maxLen = col.label.length;
    
    rows.forEach((row) => {
      let val = row[col.key];
      if (val === null || val === undefined) val = "";
      if (col.key === "amount") {
        const num = Number(val);
        val = isNaN(num) ? String(val) : num.toLocaleString();
      }
      const strVal = String(val);
      if (strVal.length > maxLen) maxLen = strVal.length;
    });

    // Convert character length to approximate points (roughly 5.5pt per char at font size 8.5)
    // We add a little padding (e.g., +10) so text doesn't touch the edges
    return {
      ...col,
      naturalWidth: (maxLen * 5.5) + 10, 
    };
  });

  // 3. Scale the columns to fit the available page width exactly
  const totalNaturalWidth = calculatedColumns.reduce((sum, col) => sum + col.naturalWidth, 0);
  const scaleFactor = availableWidth / totalNaturalWidth;

  const columnSet = calculatedColumns.map((col) => ({
    ...col,
    width: col.naturalWidth * scaleFactor,
  }));

  const headers = columnSet.map((c) => c.label);
  const body = rows.map((row) =>
    columnSet.map((c) => {
      const value = row[c.key];
      if (value === null || value === undefined) return "";
      if (c.key === "amount") {
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
      fillColor: [30, 58, 138], // #1E3A8A blue-900
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
    columnStyles: columnSet.reduce(
      (acc, col, idx) => ({
        ...acc,
        [idx]: { cellWidth: col.width, overflow: 'linebreak' },
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
      doc.text("MTPB — Integrated Enforcement System", 40, pageHeight - 24);

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

  // Fetch current user
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

  // Recent exports listener
  useEffect(() => {
    const ref = collection(db, "exportLogs");
    const q = query(ref, orderBy("timestamp", "desc"), limit(10));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows: ExportLogRow[] = snap.docs.map((d) => {
          const data = d.data();
          const fileName = data.fileName ?? "export.csv";
          return {
            id: d.id,
            fileName,
            fileType: getFileType(fileName),
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

  // Click-outside for dropdown
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
      const sourceSnap = await getDocs(collection(db, config.collection));
      let data: any[] = sourceSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const timestampField =
        dataType === "Release Log" ? "releasedAt" : "paidAt";

      data = data.filter((item) => {
        const ts = item[timestampField] || item.timestamp || item.createdAt;
        if (!(ts instanceof Timestamp)) return true;
        try {
          const date = ts.toDate();
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          return date >= start && date <= end;
        } catch {
          return true;
        }
      });

      const cleaned = sanitizeData(data);

      const slug = slugifyDataType(dataType);
      const startSlug = formatDateForFilename(startDate);
      const endSlug = formatDateForFilename(endDate);
      const extension =
        format === "CSV" ? "csv" : format === "Excel" ? "xlsx" : "pdf";
      const fileName = `${slug}_${startSlug}_${endSlug}.${extension}`;
      const reportTitle = config.label;
      const dateRange = `${startDate} to ${endDate}`;

      if (format === "CSV") {
        downloadCsv(fileName, cleaned);
      } else if (format === "Excel") {
        downloadExcel(fileName, cleaned, reportTitle, {
          exportedBy: currentUser.name,
          dateRange,
        });
      } else {
        downloadPdf(fileName, cleaned, reportTitle, {
          exportedBy: currentUser.name,
          dateRange,
        });
      }

      await addDoc(collection(db, "exportLogs"), {
        fileName,
        dataType,
        format,
        startDate,
        endDate,
        recordCount: cleaned.length,
        exportedBy: currentUser.name,
        timestamp: serverTimestamp(),
      });

      console.log(`Export ready: ${fileName} (${cleaned.length} records)`);
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

  return (
    <div className="finance-page">
      <div className="dashboard">
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
                      onChange={(e) =>
                        setDataType(e.target.value as DataType | "")
                      }
                      disabled={exporting !== null}
                    >
                      <option value="" disabled hidden>
                        Select Data Type
                      </option>
                      {DATA_TYPE_OPTIONS.map((type) => (
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

              <div className="recent-card">
                <div className="card-header">
                  <span className="card-icon-badge slate">
                    <Download size={18} />
                  </span>
                  <div className="card-header-text">
                    <h2 className="card-title">Recent Exports</h2>
                    <p className="card-subtitle">Last 10 downloaded reports</p>
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
                          <p className="recent-filename">{item.fileName}</p>
                          <p className="recent-time">{item.relativeTime}</p>
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