/* ------------------------------------------------------------------
   RECORD OFFICER — All Reports (/record-officer/reports)

   Summary reports generated from the live `violations` data:
     Daily Violations Summary · Weekly Enforcement Summary ·
     Monthly Enforcement Report
   Pick a report, move between periods, then Print or download PDF /
   Excel. Each download is written to auditLogs (type "report-generated"),
   which is where the "Last generated" column comes from.

   Report math, PDF and Excel: lib/enforcementReport.ts
   (Export Center is for raw data exports; this page is for summaries.)
------------------------------------------------------------------ */
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Printer,
  CalendarDays,
  CalendarRange,
  Calendar,
  BarChart3,
  Table2,
  ImageDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import ChangePasswordModal from "../../components/ChangePasswordModal";
import {
  REPORT_DEFS,
  buildReport,
  downloadReportExcel,
  downloadReportPdf,
  formatDateTime,
  formatMinutes,
  isCurrentOrFuture,
  periodFor,
  peso,
  shiftPeriod,
  toDate,
  type CountRow,
  type ReportKind,
  type ReportPeriod,
} from "../../lib/enforcementReport";
import {
  chartFileName,
  downloadCanvasPng,
  renderBreakdownChart,
  renderDayChart,
} from "../../lib/reportCharts";
import "./AllReports.css";

// Asset imports
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import allViolationsIcon from "../../assets/allviolations.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
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

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

type LastGenerated = { at: Date | null; by: string; format: string; period: string };

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
    items: [{ label: "Overview", icon: overviewIcon, path: "/record-officer" }],
  },
  {
    label: "Enforcement",
    items: [
      { label: "All Violations", icon: allViolationsIcon, path: "/record-officer/violations" },
      { label: "Clamping Log", icon: clampingIcon, path: "/record-officer/clamping" },
      { label: "Impounding Log", icon: impoundingIcon, path: "/record-officer/impounding" },
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
      { label: "All Reports", icon: allReportsIcon, path: "/record-officer/reports", active: true },
      { label: "Export Center", icon: exportCenterIcon, path: "/record-officer/export" },
    ],
  },
];

const REPORT_ORDER: ReportKind[] = ["daily", "weekly", "monthly"];

const REPORT_ICONS: Record<ReportKind, typeof Calendar> = {
  daily: CalendarDays,
  weekly: CalendarRange,
  monthly: Calendar,
};

/** Chart series — validated categorical pair (blue / orange). */
const SERIES = { recorded: "#2a78d6", released: "#eb6834" };

/** Download-as-PNG button shown beside a chart's title. */
function PngButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className="rp-png-btn rp-no-print"
      onClick={onClick}
      title={`Download "${label}" as an image (PNG)`}
      aria-label={`Download ${label} chart as PNG`}
    >
      <ImageDown size={14} />
      PNG
    </button>
  );
}

const RECORDS_PREVIEW = 8;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMonthInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const formatAgo = (d: Date | null): string => {
  if (!d) return "Never";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const paymentClass = (status: string): string => {
  const s = status.toLowerCase();
  if (s === "verified") return "rp-pill rp-pill-good";
  if (s.includes("pending")) return "rp-pill rp-pill-warn";
  if (s === "rejected") return "rp-pill rp-pill-bad";
  return "rp-pill rp-pill-neutral";
};

// ---------------------------------------------------------------------------
// SMALL PIECES
// ---------------------------------------------------------------------------
function Breakdown({
  title,
  label,
  rows,
  limit,
  onDownload,
}: {
  title: string;
  label: string;
  rows: CountRow[];
  limit?: number;
  onDownload?: () => void;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const max = shown[0]?.count ?? 0;
  return (
    <div className="rp-breakdown">
      <div className="rp-breakdown-head">
        <h3 className="rp-section-title">{title}</h3>
        {onDownload && shown.length > 0 && <PngButton onClick={onDownload} label={title} />}
      </div>
      {shown.length === 0 ? (
        <p className="rp-muted">No records for this period.</p>
      ) : (
        <table className="rp-mini-table">
          <thead>
            <tr>
              <th>{label}</th>
              <th className="rp-num">Count</th>
              <th className="rp-num">Share</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.name}>
                <td>
                  <span className="rp-bar-label">{row.name}</span>
                  <span className="rp-bar-track" aria-hidden="true">
                    <span
                      className="rp-bar-fill"
                      style={{ width: `${max ? (row.count / max) * 100 : 0}%` }}
                    />
                  </span>
                </td>
                <td className="rp-num">{row.count}</td>
                <td className="rp-num rp-muted">{Math.round(row.share * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {limit && rows.length > limit && (
        <p className="rp-muted rp-more-note">
          +{rows.length - limit} more in the PDF / Excel
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function AllReports() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [violations, setViolations] = useState<(DocumentData & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [lastGenerated, setLastGenerated] = useState<Partial<Record<ReportKind, LastGenerated>>>({});

  const [period, setPeriod] = useState<ReportPeriod>(() => periodFor("daily", new Date()));
  const [trendView, setTrendView] = useState<"chart" | "table">("chart");
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [busy, setBusy] = useState<"" | "pdf" | "excel">("");

  // -----------------------------------------------------------------------
  // Current user
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "record-officer" });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        if (snap.exists()) {
          const data = snap.data();
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
  // Violations (live)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "violations"),
      (snap) => {
        setViolations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadError("");
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load violations:", err);
        setLoadError("Couldn't load the violations data. Check your connection and try again.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // -----------------------------------------------------------------------
  // Last generated (from audit logs)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "auditLogs"), where("type", "==", "report-generated")),
      (snap) => {
        const latest: Partial<Record<ReportKind, LastGenerated>> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const kind = data.metadata?.reportKind as ReportKind | undefined;
          if (!kind || !REPORT_DEFS[kind]) return;
          const at = toDate(data.timestamp);
          const current = latest[kind];
          if (!current || (at && (!current.at || at > current.at))) {
            latest[kind] = {
              at,
              by: data.userName ?? "—",
              format: data.metadata?.format ?? "",
              period: data.metadata?.period ?? "",
            };
          }
        });
        setLastGenerated(latest);
      },
      (err) => console.warn("Report history not loaded:", err.code)
    );
    return () => unsubscribe();
  }, []);

  // -----------------------------------------------------------------------
  // Click-outside for dropdown
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

  const report = useMemo(() => buildReport(violations, period), [violations, period]);
  const def = REPORT_DEFS[period.kind];
  const atLatest = isCurrentOrFuture(period);
  const isEmpty =
    report.recorded === 0 && report.settledCount === 0 && report.releasedCount === 0;

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

  const openReport = (kind: ReportKind) => {
    setPeriod(periodFor(kind, new Date()));
    setShowAllRecords(false);
    // Bring the report into view when opened from the list.
    requestAnimationFrame(() =>
      reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  const changePeriod = (next: ReportPeriod) => {
    setPeriod(next);
    setShowAllRecords(false);
  };

  const handlePickDate = (value: string) => {
    if (!value) return;
    const [y, m, d] = value.split("-").map(Number);
    changePeriod(periodFor(period.kind, new Date(y, (m ?? 1) - 1, d ?? 1)));
  };

  const logGenerated = async (format: "PDF" | "Excel" | "Print") => {
    try {
      await addDoc(collection(db, "auditLogs"), {
        userName: currentUser.name,
        userRole: currentUser.role,
        action: `generated ${def.title} (${period.label}) — ${format}`,
        record: def.title,
        type: "report-generated",
        metadata: {
          reportKind: period.kind,
          period: period.label,
          periodStart: period.start,
          periodEnd: period.end,
          format,
          violationsRecorded: report.recorded,
        },
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.warn("Report log not written:", err);
    }
  };

  const handleDownload = async (format: "pdf" | "excel") => {
    setBusy(format);
    try {
      if (format === "pdf") downloadReportPdf(report, currentUser.name);
      else downloadReportExcel(report, currentUser.name);
      await logGenerated(format === "pdf" ? "PDF" : "Excel");
    } catch (err) {
      console.error("Report download failed:", err);
      alert("Couldn't create the report file. Please try again.");
    } finally {
      setBusy("");
    }
  };

  const handlePrint = () => {
    setShowAllRecords(true);
    void logGenerated("Print");
    // Let the full list render before the print dialog opens.
    setTimeout(() => window.print(), 150);
  };

  /** Saves one chart as a PNG, titled with the report and period. */
  const downloadChart = (chart: string, draw: (heading: { title: string; subtitle: string }) => HTMLCanvasElement) => {
    try {
      const canvas = draw({
        title: chart,
        subtitle: `${def.title} · ${period.label} · MTPB Sector 3`,
      });
      downloadCanvasPng(canvas, chartFileName(chart, period.fileTag));
    } catch (err) {
      console.error("Chart download failed:", err);
      alert("Couldn't create the chart image. Please try again.");
    }
  };

  const breakdownDownload = (chart: string, rows: CountRow[], limit = 10) => () =>
    downloadChart(chart, (heading) => renderBreakdownChart(rows, { ...heading, limit }));

  const shownRecords = showAllRecords
    ? report.records
    : report.records.slice(0, RECORDS_PREVIEW);

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <div className="record-page reports-page">
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
              <h1>All Reports</h1>
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
                    <p className="dropdown-role">{ROLE_LABELS[currentUser.role]}</p>
                  </div>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setShowChangePassword(true);
                    }}
                  >
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
            {/* REPORT LIST */}
            <div className="card rp-list-card">
              <p className="card-eyebrow">SECTOR 3</p>
              <h2 className="card-title">Reports</h2>

              <div className="table-wrapper">
                <table className="data-table rp-list-table">
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Covers</th>
                      <th>Formats</th>
                      <th>Last generated</th>
                      <th aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {REPORT_ORDER.map((kind) => {
                      const Icon = REPORT_ICONS[kind];
                      const last = lastGenerated[kind];
                      const selected = period.kind === kind;
                      return (
                        <tr key={kind} className={selected ? "rp-row-selected" : ""}>
                          <td>
                            <div className="rp-report-name">
                              <span className="rp-report-icon">
                                <Icon size={16} />
                              </span>
                              <div>
                                <p className="rp-report-title">{REPORT_DEFS[kind].title}</p>
                                <p className="rp-report-desc">{REPORT_DEFS[kind].description}</p>
                              </div>
                            </div>
                          </td>
                          <td className="rp-nowrap">{REPORT_DEFS[kind].covers}</td>
                          <td>
                            <span className="rp-format">PDF</span>
                            <span className="rp-format">Excel</span>
                          </td>
                          <td className="rp-nowrap">
                            {last ? (
                              <>
                                <p className="rp-last-main">{formatAgo(last.at)}</p>
                                <p className="rp-last-sub">
                                  {last.period} · {last.format} · {last.by}
                                </p>
                              </>
                            ) : (
                              <span className="rp-muted">Never</span>
                            )}
                          </td>
                          <td className="rp-action-cell">
                            <button
                              type="button"
                              className={`rp-open-btn ${selected ? "is-selected" : ""}`}
                              onClick={() => openReport(kind)}
                              aria-pressed={selected}
                            >
                              {selected ? "Viewing" : "Open"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* REPORT */}
            <div className="card rp-report-card" ref={reportRef}>
              <div className="rp-report-head">
                <div>
                  <p className="rp-print-only rp-print-org">
                    MTPB · Manila Traffic and Parking Bureau · Integrated Enforcement System
                  </p>
                  <p className="card-eyebrow">SECTOR 3 · {def.title.toUpperCase()}</p>
                  <h2 className="card-title rp-period-title">{period.label}</h2>
                  <p className="rp-print-only rp-print-meta">
                    Generated {formatDateTime(new Date())} by {currentUser.name} (Record Officer)
                  </p>
                </div>

                <div className="rp-actions">
                  <button
                    type="button"
                    className="rp-btn"
                    onClick={handlePrint}
                    disabled={loading}
                  >
                    <Printer size={15} /> Print
                  </button>
                  <button
                    type="button"
                    className="rp-btn"
                    onClick={() => handleDownload("excel")}
                    disabled={loading || busy !== ""}
                  >
                    <FileSpreadsheet size={15} />
                    {busy === "excel" ? "Preparing..." : "Excel"}
                  </button>
                  <button
                    type="button"
                    className="rp-btn rp-btn-primary"
                    onClick={() => handleDownload("pdf")}
                    disabled={loading || busy !== ""}
                  >
                    <FileText size={15} />
                    {busy === "pdf" ? "Preparing..." : "Download PDF"}
                  </button>
                </div>
              </div>

              {/* PERIOD PICKER */}
              <div className="rp-period-bar">
                <div className="rp-tabs" role="tablist" aria-label="Report">
                  {REPORT_ORDER.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      role="tab"
                      aria-selected={period.kind === kind}
                      className={`rp-tab ${period.kind === kind ? "is-active" : ""}`}
                      onClick={() =>
                        changePeriod(periodFor(kind, atLatest ? new Date() : period.start))
                      }
                    >
                      {kind === "daily" ? "Daily" : kind === "weekly" ? "Weekly" : "Monthly"}
                    </button>
                  ))}
                </div>

                <div className="rp-period-nav">
                  <button
                    type="button"
                    className="rp-icon-btn"
                    onClick={() => changePeriod(shiftPeriod(period, -1))}
                    aria-label="Previous period"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {period.kind === "monthly" ? (
                    <input
                      type="month"
                      className="rp-date-input"
                      value={toMonthInput(period.start)}
                      max={toMonthInput(new Date())}
                      onChange={(e) => handlePickDate(`${e.target.value}-01`)}
                      aria-label="Month"
                    />
                  ) : (
                    <input
                      type="date"
                      className="rp-date-input"
                      value={toDateInput(period.start)}
                      max={toDateInput(new Date())}
                      onChange={(e) => handlePickDate(e.target.value)}
                      aria-label={period.kind === "weekly" ? "Any day in the week" : "Date"}
                    />
                  )}
                  <button
                    type="button"
                    className="rp-icon-btn"
                    onClick={() => changePeriod(shiftPeriod(period, 1))}
                    disabled={atLatest}
                    aria-label="Next period"
                  >
                    <ChevronRight size={16} />
                  </button>
                  {!atLatest && (
                    <button
                      type="button"
                      className="rp-link-btn"
                      onClick={() => changePeriod(periodFor(period.kind, new Date()))}
                    >
                      {period.kind === "daily"
                        ? "Today"
                        : period.kind === "weekly"
                          ? "This week"
                          : "This month"}
                    </button>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading report data...</p>
                </div>
              ) : loadError ? (
                <div className="rp-error">{loadError}</div>
              ) : (
                <>
                  {atLatest && (
                    <p className="rp-live-note rp-no-print">
                      This period isn't over yet — figures update as new records come in.
                    </p>
                  )}

                  {/* KEY FIGURES */}
                  <div className="rp-kpis">
                    <div className="rp-kpi">
                      <p className="rp-kpi-label">Violations recorded</p>
                      <p className="rp-kpi-value">{report.recorded}</p>
                      <p className="rp-kpi-sub">
                        {report.clamped} clamped · {report.ticketed} ticketed
                        {report.impoundedDirect ? ` · ${report.impoundedDirect} towed` : ""}
                      </p>
                    </div>
                    <div className="rp-kpi">
                      <p className="rp-kpi-label">Fines assessed</p>
                      <p className="rp-kpi-value">{peso(report.finesAssessed)}</p>
                      <p className="rp-kpi-sub">On violations recorded this period</p>
                    </div>
                    <div className="rp-kpi">
                      <p className="rp-kpi-label">Payments settled</p>
                      <p className="rp-kpi-value">{report.settledCount}</p>
                      <p className="rp-kpi-sub">{peso(report.settledAmount)} verified</p>
                    </div>
                    <div className="rp-kpi">
                      <p className="rp-kpi-label">Vehicles released</p>
                      <p className="rp-kpi-value">{report.releasedCount}</p>
                      <p className="rp-kpi-sub">
                        Avg. {formatMinutes(report.avgReleaseMinutes)} from payment
                      </p>
                    </div>
                  </div>

                  <div className="rp-status-strip">
                    <span>
                      <strong>{report.unpaid}</strong> still unpaid
                    </span>
                    <span>
                      <strong>{report.awaitingVerification}</strong> awaiting payment verification
                    </span>
                    <span>
                      <strong>{report.wentToImpound}</strong> went to impound
                    </span>
                  </div>

                  {isEmpty ? (
                    <div className="rp-empty">
                      <p className="rp-empty-title">No activity for {period.label}</p>
                      <p className="rp-muted">
                        No violations were recorded, settled or released in this period.
                        Try an earlier {period.kind === "monthly" ? "month" : period.kind === "weekly" ? "week" : "day"}.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* DAY BY DAY */}
                      {report.days.length > 0 && (
                        <div className="rp-section">
                          <div className="rp-section-head">
                            <h3 className="rp-section-title">Day by day</h3>
                            <div className="rp-section-tools">
                            <PngButton
                              label="Day by day"
                              onClick={() =>
                                downloadChart("Day by day", (heading) =>
                                  renderDayChart(report.days, heading)
                                )
                              }
                            />
                            <div className="rp-toggle rp-no-print" role="group" aria-label="View">
                              <button
                                type="button"
                                className={trendView === "chart" ? "is-active" : ""}
                                onClick={() => setTrendView("chart")}
                                aria-pressed={trendView === "chart"}
                              >
                                <BarChart3 size={14} /> Chart
                              </button>
                              <button
                                type="button"
                                className={trendView === "table" ? "is-active" : ""}
                                onClick={() => setTrendView("table")}
                                aria-pressed={trendView === "table"}
                              >
                                <Table2 size={14} /> Table
                              </button>
                            </div>
                            </div>
                          </div>

                          {trendView === "chart" ? (
                            <div className="rp-chart">
                              <ResponsiveContainer width="100%" height={240}>
                                <BarChart
                                  data={report.days}
                                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                                  barGap={2}
                                  barCategoryGap={period.kind === "weekly" ? "28%" : "18%"}
                                >
                                  <CartesianGrid vertical={false} stroke="#EEF0F3" />
                                  <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11, fill: "#6B7280" }}
                                    axisLine={{ stroke: "#E5E7EB" }}
                                    tickLine={false}
                                    interval={period.kind === "monthly" ? 2 : 0}
                                  />
                                  <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <Tooltip
                                    cursor={{ fill: "rgba(42, 120, 214, 0.06)" }}
                                    contentStyle={{
                                      borderRadius: 8,
                                      border: "1px solid #E5E7EB",
                                      fontSize: 12,
                                    }}
                                  />
                                  <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: 12, color: "#374151" }}
                                  />
                                  <Bar
                                    dataKey="recorded"
                                    name="Recorded"
                                    fill={SERIES.recorded}
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={22}
                                  />
                                  <Bar
                                    dataKey="released"
                                    name="Released"
                                    fill={SERIES.released}
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={22}
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : null}

                          <table
                            className={`rp-mini-table rp-day-table ${
                              trendView === "chart" ? "rp-print-only" : ""
                            }`}
                          >
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th className="rp-num">Recorded</th>
                                <th className="rp-num">Settled</th>
                                <th className="rp-num">Released</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.days.map((d) => (
                                <tr key={d.label}>
                                  <td>{d.label}</td>
                                  <td className="rp-num">{d.recorded}</td>
                                  <td className="rp-num">{d.settled}</td>
                                  <td className="rp-num">{d.released}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* BREAKDOWNS */}
                      <div className="rp-breakdown-grid">
                        <Breakdown
                          title="By violation type"
                          label="Violation"
                          rows={report.byViolation}
                          onDownload={breakdownDownload("Violations by type", report.byViolation)}
                        />
                        <Breakdown
                          title="Top locations"
                          label="Location"
                          rows={report.byLocation}
                          limit={8}
                          onDownload={breakdownDownload("Top locations", report.byLocation)}
                        />
                        <Breakdown
                          title="By enforcer"
                          label="Enforcer"
                          rows={report.byOfficer}
                          onDownload={breakdownDownload("Violations by enforcer", report.byOfficer)}
                        />
                        <Breakdown
                          title="By vehicle type"
                          label="Vehicle"
                          rows={report.byVehicleType}
                          onDownload={breakdownDownload("Violations by vehicle type", report.byVehicleType)}
                        />
                      </div>

                      {/* RECORDS */}
                      <div className="rp-section">
                        <h3 className="rp-section-title">
                          Violations recorded <span className="rp-count">{report.records.length}</span>
                        </h3>
                        {report.records.length === 0 ? (
                          <p className="rp-muted">No violations were recorded in this period.</p>
                        ) : (
                          <div className="table-wrapper">
                            <table className="data-table rp-records-table">
                              <thead>
                                <tr>
                                  <th>CIN</th>
                                  <th>Plate No.</th>
                                  <th>Violation</th>
                                  <th>Location</th>
                                  <th>Enforcer</th>
                                  <th>Recorded</th>
                                  <th className="rp-num">Amount</th>
                                  <th>Payment</th>
                                </tr>
                              </thead>
                              <tbody>
                                {shownRecords.map((r, i) => (
                                  <tr key={`${r.cin}-${i}`}>
                                    <td>
                                      <span className="cin-pill">{r.cin}</span>
                                    </td>
                                    <td className="cell-plate">{r.plateNo}</td>
                                    <td>{r.violation}</td>
                                    <td className="rp-cell-location">{r.location}</td>
                                    <td>{r.officer}</td>
                                    <td className="rp-nowrap">{formatDateTime(r.recordedAt)}</td>
                                    <td className="rp-num rp-nowrap">{peso(r.amount)}</td>
                                    <td>
                                      <span className={paymentClass(r.payment)}>{r.payment}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {report.records.length > RECORDS_PREVIEW && (
                          <button
                            type="button"
                            className="rp-link-btn rp-show-all rp-no-print"
                            onClick={() => setShowAllRecords((v) => !v)}
                          >
                            {showAllRecords
                              ? "Show fewer"
                              : `Show all ${report.records.length} violations`}
                          </button>
                        )}
                      </div>

                      {/* SIGNATURES (print) */}
                      <div className="rp-signatures rp-print-only">
                        <div>
                          <p className="rp-sig-caption">Prepared by</p>
                          <p className="rp-sig-name">{currentUser.name}</p>
                          <p className="rp-sig-role">Record Officer</p>
                        </div>
                        <div>
                          <p className="rp-sig-caption">Noted by</p>
                          <p className="rp-sig-name">&nbsp;</p>
                          <p className="rp-sig-role">Officer in Charge</p>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
