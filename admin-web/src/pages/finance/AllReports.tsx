/* ------------------------------------------------------------------
   FINANCE — All Reports (/finance/reports)

   Collection reports generated from the live `payments` data:
     Daily Collection Report · Weekly Collection Report ·
     Monthly Collection Report
   Pick a report and a period, then Print or download PDF / Excel.
   Each download is written to auditLogs (type "finance-report-generated"),
   which is where "Last generated" comes from.

   Finance staff see their own location only (City Hall, or Central +
   Online/GCash), like Transaction History and Revenue Reports.

   Report math, PDF and Excel: lib/financeReport.ts
------------------------------------------------------------------ */
import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Printer } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useStaffProfile } from "../../lib/useStaffProfile";
import { isInStaffScope, staffScopeLabel } from "../../lib/paymentLocation";
import {
  formatDateTime,
  isCurrentOrFuture,
  periodFor,
  peso,
  shiftPeriod,
  toDate,
  type ReportKind,
  type ReportPeriod,
} from "../../lib/enforcementReport";
import {
  buildFinanceReport,
  downloadFinanceExcel,
  downloadFinancePdf,
  FINANCE_REPORT_DEFS,
  FINANCE_SERIES,
  normalizePayment,
  orRangeText,
  pesoShort,
  type AmountRow,
  type PaymentItem,
} from "../../lib/financeReport";
import "./Homepage.css";
import "./AllReports.css";
import "../record-officer/AllReports.css";

// Asset imports
import overviewIcon from "../../assets/overview.png";
import pendingPaymentsIcon from "../../assets/pendingpayments.png";
import paymentVerificationIcon from "../../assets/paymentverification.png";
import transactionIcon from "../../assets/transaction.png";
import revenueIcon from "../../assets/revenue.png";
import allReportsIcon from "../../assets/reports.png";
import exportCenterIcon from "../../assets/export.png";
import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";
import { clientIp } from "../../lib/staffSession";
import ChartPurpose from "../../components/ChartPurpose";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

type LastGenerated = { at: Date | null; by: string; format: string; period: string };

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const ROLE_LABELS: Record<string, string> = {
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
      { label: "Pending Payments", icon: pendingPaymentsIcon, path: "/finance/pending" },
      { label: "Payment Verification", icon: paymentVerificationIcon, path: "/finance/verification" },
      { label: "Transaction History", icon: transactionIcon, path: "/finance/transactions" },
      { label: "Revenue Reports", icon: revenueIcon, path: "/finance/revenue" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "All Reports", icon: allReportsIcon, path: "/finance/reports", active: true },
      { label: "Export Center", icon: exportCenterIcon, path: "/finance/export" },
    ],
  },
];

const REPORT_ORDER: ReportKind[] = ["daily", "weekly", "monthly"];
const RECORDS_PREVIEW = 8;
const LOG_TYPE = "finance-report-generated";

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

const statusClass = (status: string): string => {
  if (status === "Verified") return "rp-pill rp-pill-good";
  if (status === "Rejected") return "rp-pill rp-pill-bad";
  return "rp-pill rp-pill-warn";
};

// ---------------------------------------------------------------------------
// SMALL PIECES
// ---------------------------------------------------------------------------
/** Horizontal bars of an amount breakdown (₱ + number of payments). */
function AmountBars({
  title,
  rows,
  limit = 6,
  purpose,
}: {
  title: string;
  rows: AmountRow[];
  limit?: number;
  /** What the chart is for (ChartPurpose). */
  purpose?: string;
}) {
  const shown = rows.slice(0, limit).map((r) => ({
    ...r,
    label: `${pesoShort(r.amount)} · ${r.count}`,
  }));
  return (
    <div className="card rp-chart-card">
      <div className="rp-section-head">
        <div>
          <h3 className="rp-section-title">{title}</h3>
          <p className="rp-chart-sub">Amount received · number of payments</p>
          {purpose && <ChartPurpose>{purpose}</ChartPurpose>}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="rp-muted">No payments for this period.</p>
      ) : (
        <div className="rp-chart">
          <ResponsiveContainer width="100%" height={shown.length * 36 + 12}>
            <BarChart
              data={shown}
              layout="vertical"
              margin={{ top: 4, right: 96, left: 0, bottom: 4 }}
              barCategoryGap={10}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={170}
                tick={{ fontSize: 12, fill: "#374151" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(42, 120, 214, 0.06)" }}
                contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12 }}
                formatter={(value) => [peso(Number(value)), "Amount"]}
              />
              <Bar
                dataKey="amount"
                name="Amount"
                fill={FINANCE_SERIES.verified.color}
                radius={[0, 4, 4, 0]}
                maxBarSize={16}
                background={{ fill: "#F1F3F5", radius: 4 }}
              >
                <LabelList dataKey="label" position="right" style={{ fontSize: 12, fill: "#374151" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {rows.length > limit && (
        <p className="rp-muted rp-more-note">+{rows.length - limit} more in the PDF / Excel</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function AllReports() {

  const { profile, ready: userReady } = useStaffProfile();
  const userName = profile?.name || "Loading...";
  const role = profile?.role || "finance";
  const roleLabel = ROLE_LABELS[role] ?? "Finance Staff";
  const assignedLocation = profile?.assignedLocation ?? null;

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [lastGenerated, setLastGenerated] = useState<Partial<Record<ReportKind, LastGenerated>>>({});

  const [period, setPeriod] = useState<ReportPeriod>(() => periodFor("daily", new Date()));
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [busy, setBusy] = useState<"" | "pdf" | "excel">("");

  // -----------------------------------------------------------------------
  // Payments (live)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "payments"),
      (snap) => {
        setPayments(snap.docs.map((d) => normalizePayment(d.id, d.data())));
        setLoadError("");
        setPaymentsLoading(false);
      },
      (err) => {
        console.error("Failed to load payments:", err);
        setLoadError("Couldn't load the payments data. Check your connection and try again.");
        setPaymentsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // -----------------------------------------------------------------------
  // Last generated (from audit logs)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "auditLogs"), where("type", "==", LOG_TYPE)),
      (snap) => {
        const latest: Partial<Record<ReportKind, LastGenerated>> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const kind = data.metadata?.reportKind as ReportKind | undefined;
          if (!kind || !FINANCE_REPORT_DEFS[kind]) return;
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

  // Finance: own location only. OIC / IT Admin: everything.
  const scoped = useMemo(() => {
    if (!userReady) return [];
    if (role !== "finance") return payments;
    return payments.filter((p) => isInStaffScope(assignedLocation, p.location));
  }, [payments, userReady, role, assignedLocation]);

  const scopeLabel =
    role === "finance" && assignedLocation ? staffScopeLabel(assignedLocation) : "All locations";

  const report = useMemo(
    () => buildFinanceReport(scoped, period, scopeLabel),
    [scoped, period, scopeLabel]
  );
  const def = FINANCE_REPORT_DEFS[period.kind];
  const loading = paymentsLoading || !userReady;
  const atLatest = isCurrentOrFuture(period);
  const isEmpty = report.payments.length === 0;
  const trendTitle = period.kind === "daily" ? "Hour by hour" : "Day by day";

  // -----------------------------------------------------------------------
  // HANDLERS
  // -----------------------------------------------------------------------

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
        userName,
        userRole: role,
        action: `generated ${def.title} (${period.label}, ${scopeLabel}) — ${format}`,
        record: def.title,
        type: LOG_TYPE,
        metadata: {
          reportKind: period.kind,
          period: period.label,
          periodStart: period.start,
          periodEnd: period.end,
          scope: scopeLabel,
          format,
          totalReceived: report.received,
          payments: report.receivedCount,
        },
        timestamp: serverTimestamp(),
        ipAddress: clientIp(),
      });
    } catch (err) {
      console.warn("Report log not written:", err);
    }
  };

  const handleDownload = async (format: "pdf" | "excel") => {
    setBusy(format);
    try {
      if (format === "pdf") downloadFinancePdf(report, userName, roleLabel);
      else downloadFinanceExcel(report, userName);
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
    setTimeout(() => window.print(), 150);
  };

  const shownRecords = showAllRecords
    ? report.payments
    : report.payments.slice(0, RECORDS_PREVIEW);

  const trendData = report.trend.map((t) => ({
    label: t.label,
    verified: t.verified,
    pending: t.pending,
  }));

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <div className="finance-page reports-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={NAV_GROUPS} role={<>Finance Staff
                {assignedLocation && (
                  <span className="sidebar-brand-location">
                    {" · "}
                    {assignedLocation}
                  </span>
                )}</>} />

        {/* MAIN CONTENT */}
        <div className="main">
          <AppTopbar groups={NAV_GROUPS} />
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

          </header>

          <main className="main-content">
            {/* FILTERS — pick the report and the period */}
            <div className="card rp-filter-card">
              <div className="rp-report-head">
                <div>
                  <p className="rp-print-only rp-print-org">
                    MTPB · Manila Traffic and Parking Bureau · Finance
                  </p>
                  <p className="card-eyebrow">{scopeLabel.toUpperCase()}</p>
                  <h2 className="card-title rp-period-title">
                    {def.title}
                    <span className="rp-print-only rp-print-period">{period.label}</span>
                  </h2>
                  <p className="rp-print-only rp-print-meta">
                    Generated {formatDateTime(new Date())} by {userName} ({roleLabel})
                  </p>
                  <p className="rp-last-generated rp-no-print">
                    {lastGenerated[period.kind]
                      ? `Last generated ${formatAgo(lastGenerated[period.kind]!.at)} · ${
                          lastGenerated[period.kind]!.period
                        } · ${lastGenerated[period.kind]!.format} · ${lastGenerated[period.kind]!.by}`
                      : def.description}
                  </p>
                </div>

                <div className="rp-actions">
                  <button type="button" className="rp-btn" onClick={handlePrint} disabled={loading}>
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

              <div className="rp-period-bar">
                <div className="rp-filter-group">
                  <span className="rp-filter-label">Report</span>
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
                        title={FINANCE_REPORT_DEFS[kind].title}
                      >
                        {kind === "daily" ? "Daily" : kind === "weekly" ? "Weekly" : "Monthly"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rp-filter-group">
                  <span className="rp-filter-label">
                    {period.kind === "daily" ? "Date" : period.kind === "weekly" ? "Week" : "Month"}
                  </span>
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
              </div>

              {atLatest && !loading && (
                <p className="rp-live-note rp-no-print">
                  This period isn't over yet — figures update as new payments come in.
                </p>
              )}
            </div>

            {loading ? (
              <div className="card">
                <div className="table-loading">
                  <p>Loading report data...</p>
                </div>
              </div>
            ) : loadError ? (
              <div className="card">
                <div className="rp-error">{loadError}</div>
              </div>
            ) : isEmpty ? (
              <div className="card">
                <div className="rp-empty">
                  <p className="rp-empty-title">No payments for {period.label}</p>
                  <p className="rp-muted">
                    No payments were received in this period ({scopeLabel}). Try an earlier{" "}
                    {period.kind === "monthly" ? "month" : period.kind === "weekly" ? "week" : "day"}.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* CHARTS — first thing to see */}
                <div className="card rp-chart-card">
                  <div className="rp-section-head">
                    <div>
                      <h3 className="rp-section-title">{trendTitle}</h3>
                      <p className="rp-chart-sub">Amount received — verified vs awaiting verification</p>
                      <ChartPurpose>
                        Shows when payments come in, and how many still need to be verified.
                      </ChartPurpose>
                    </div>
                  </div>
                  <div className="rp-chart">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={trendData}
                        margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                        barGap={2}
                        barCategoryGap={period.kind === "weekly" ? "28%" : "18%"}
                      >
                        <CartesianGrid vertical={false} stroke="#EEF0F3" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: "#6B7280" }}
                          axisLine={{ stroke: "#E5E7EB" }}
                          tickLine={false}
                          interval={period.kind === "weekly" ? 0 : 2}
                        />
                        <YAxis
                          tickFormatter={(v) => pesoShort(Number(v))}
                          tick={{ fontSize: 11, fill: "#9CA3AF" }}
                          axisLine={false}
                          tickLine={false}
                          width={56}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(42, 120, 214, 0.06)" }}
                          contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12 }}
                          formatter={(value, name) => [peso(Number(value)), name]}
                        />
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          itemSorter={null}
                          wrapperStyle={{ fontSize: 12, color: "#374151" }}
                        />
                        <Bar
                          dataKey="verified"
                          name={FINANCE_SERIES.verified.label}
                          fill={FINANCE_SERIES.verified.color}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={22}
                        />
                        <Bar
                          dataKey="pending"
                          name={FINANCE_SERIES.pending.label}
                          fill={FINANCE_SERIES.pending.color}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={22}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rp-chart-grid">
                  <AmountBars title="By location" purpose="Which payment location collects the most." rows={report.byLocation} />
                  <AmountBars title="By payment method" purpose="How people pay: cash at the office or online." rows={report.byMethod} />
                  <AmountBars title="By charge type" purpose="Revenue from clamp fines compared with impound fees." rows={report.byCharge} />
                  <AmountBars title="By staff (received by)" purpose="Payments received by each staff member, for accountability." rows={report.byStaff} />
                </div>

                {/* KEY FIGURES */}
                <div className="card">
                  <h3 className="rp-section-title">Key figures</h3>
                  <div className="rp-kpis">
                    <div className="rp-kpi">
                      <p className="rp-kpi-label">Total received</p>
                      <p className="rp-kpi-value">{peso(report.received)}</p>
                      <p className="rp-kpi-sub">{report.receivedCount} payments</p>
                    </div>
                    <div className="rp-kpi">
                      <p className="rp-kpi-label">Verified</p>
                      <p className="rp-kpi-value">{peso(report.verified)}</p>
                      <p className="rp-kpi-sub">{report.verifiedCount} payments</p>
                    </div>
                    <div className="rp-kpi">
                      <p className="rp-kpi-label">Awaiting verification</p>
                      <p className="rp-kpi-value">{peso(report.pending)}</p>
                      <p className="rp-kpi-sub">{report.pendingCount} payments</p>
                    </div>
                    <div className="rp-kpi">
                      <p className="rp-kpi-label">Cash · GCash</p>
                      <p className="rp-kpi-value">{peso(report.cash)}</p>
                      <p className="rp-kpi-sub">{peso(report.gcash)} via GCash</p>
                    </div>
                  </div>

                  <div className="rp-status-strip">
                    <span>
                      OR issued: <strong>{orRangeText(report)}</strong>
                    </span>
                    <span>
                      <strong>{report.rejectedCount}</strong> rejected ({peso(report.rejected)}, not
                      counted)
                    </span>
                  </div>
                </div>

                {/* PAYMENTS */}
                <div className="card">
                  <h3 className="rp-section-title">
                    Payments received <span className="rp-count">{report.payments.length}</span>
                  </h3>
                  <div className="table-wrapper" tabIndex={0} role="region" aria-label="Data table" data-scroll-region>
                    <table className="data-table rp-records-table">
                      <thead>
                        <tr>
                          <th>Received</th>
                          <th>Reference No.</th>
                          <th>OR No.</th>
                          <th>CIN</th>
                          <th>Plate No.</th>
                          <th>Charge</th>
                          <th>Method</th>
                          <th>Received by</th>
                          <th className="rp-num">Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownRecords.map((p) => (
                          <tr key={p.id}>
                            <td className="rp-nowrap">{formatDateTime(p.receivedAt)}</td>
                            <td className="rp-nowrap">{p.referenceNumber}</td>
                            <td className="rp-nowrap">{p.orNumber}</td>
                            <td>
                              <span className="cin-pill">{p.cin}</span>
                            </td>
                            <td className="cell-plate">{p.plateNo}</td>
                            <td>{p.chargeType}</td>
                            <td>{p.method}</td>
                            <td>{p.receivedBy}</td>
                            <td className="rp-num rp-nowrap">{peso(p.amount)}</td>
                            <td>
                              <span className={statusClass(p.state)}>{p.state}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {report.payments.length > RECORDS_PREVIEW && (
                    <button
                      type="button"
                      className="rp-link-btn rp-show-all rp-no-print"
                      onClick={() => setShowAllRecords((v) => !v)}
                    >
                      {showAllRecords ? "Show fewer" : `Show all ${report.payments.length} payments`}
                    </button>
                  )}

                  {/* SIGNATURES (print) */}
                  <div className="rp-signatures rp-print-only">
                    <div>
                      <p className="rp-sig-caption">Prepared by</p>
                      <p className="rp-sig-name">{userName}</p>
                      <p className="rp-sig-role">{roleLabel}</p>
                    </div>
                    <div>
                      <p className="rp-sig-caption">Noted by</p>
                      <p className="rp-sig-name">&nbsp;</p>
                      <p className="rp-sig-role">Officer in Charge</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

    </div>
  );
}
