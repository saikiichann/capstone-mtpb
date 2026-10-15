/* ------------------------------------------------------------------
   ENFORCEMENT REPORTS (Record Officer → All Reports)

   Summary reports built from the `violations` collection:
     - Daily Violations Summary   (one day)
     - Weekly Enforcement Summary (Monday–Sunday)
     - Monthly Enforcement Report (calendar month)

   Numbers per period:
     - Recorded: violations whose recordedAt falls in the period.
     - Settled: payments verified in the period (verifiedAt, else paidAt).
     - Released: vehicles released in the period (releasedAt).
   Fines assessed / settled use the impound fee when the vehicle was
   impounded (₱2,000 replaces the clamp fine), same as everywhere else.

   Export Center exports raw rows; these are the summarized reports.
------------------------------------------------------------------ */
import type { DocumentData } from "firebase/firestore";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { amountDue, impoundFeeDue } from "./impoundFlag";

export type ReportKind = "daily" | "weekly" | "monthly";

export type ReportPeriod = {
  kind: ReportKind;
  start: Date; // inclusive
  end: Date; // exclusive
  /** e.g. "October 15, 2026" / "Oct 12 – 18, 2026" / "October 2026" */
  label: string;
  /** Safe for file names, e.g. 2026-10-15 / 2026-W42 / 2026-10 */
  fileTag: string;
};

export const REPORT_DEFS: Record<
  ReportKind,
  { title: string; covers: string; description: string }
> = {
  daily: {
    title: "Daily Violations Summary",
    covers: "One day",
    description: "Violations recorded, payments settled and vehicles released in one day.",
  },
  weekly: {
    title: "Weekly Enforcement Summary",
    covers: "Monday – Sunday",
    description: "The week's enforcement activity with a day-by-day breakdown.",
  },
  monthly: {
    title: "Monthly Enforcement Report",
    covers: "Calendar month",
    description: "The month's enforcement, payment and release totals for MTPB records.",
  },
};

// ---------------------------------------------------------------------------
// PERIODS
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** ISO-8601 week number, for file names. */
const isoWeek = (d: Date): { year: number; week: number } => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
};

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString("en-US", opts);

export const periodFor = (kind: ReportKind, anchor: Date): ReportPeriod => {
  const a = dayStart(anchor);
  if (kind === "daily") {
    return {
      kind,
      start: a,
      end: addDays(a, 1),
      label: fmt(a, { month: "long", day: "numeric", year: "numeric" }),
      fileTag: `${a.getFullYear()}-${pad(a.getMonth() + 1)}-${pad(a.getDate())}`,
    };
  }
  if (kind === "weekly") {
    const start = addDays(a, -((a.getDay() + 6) % 7)); // Monday
    const last = addDays(start, 6);
    const sameMonth = start.getMonth() === last.getMonth();
    const sameYear = start.getFullYear() === last.getFullYear();
    const label = sameMonth
      ? `${fmt(start, { month: "short", day: "numeric" })} – ${last.getDate()}, ${last.getFullYear()}`
      : `${fmt(start, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })} – ${fmt(last, { month: "short", day: "numeric", year: "numeric" })}`;
    const { year, week } = isoWeek(start);
    return { kind, start, end: addDays(start, 7), label, fileTag: `${year}-W${pad(week)}` };
  }
  const start = new Date(a.getFullYear(), a.getMonth(), 1);
  return {
    kind,
    start,
    end: new Date(a.getFullYear(), a.getMonth() + 1, 1),
    label: fmt(start, { month: "long", year: "numeric" }),
    fileTag: `${start.getFullYear()}-${pad(start.getMonth() + 1)}`,
  };
};

/** The period before (-1) or after (+1). */
export const shiftPeriod = (period: ReportPeriod, step: number): ReportPeriod => {
  const { kind, start } = period;
  if (kind === "daily") return periodFor(kind, addDays(start, step));
  if (kind === "weekly") return periodFor(kind, addDays(start, 7 * step));
  return periodFor(kind, new Date(start.getFullYear(), start.getMonth() + step, 1));
};

export const isCurrentOrFuture = (period: ReportPeriod, now = new Date()): boolean =>
  period.end.getTime() > now.getTime();

// ---------------------------------------------------------------------------
// COMPUTE
// ---------------------------------------------------------------------------
export type CountRow = { name: string; count: number; share: number };

export type DayRow = {
  date: Date;
  label: string; // "Oct 15" / "Mon"
  recorded: number;
  settled: number;
  released: number;
};

export type RecordRow = {
  cin: string;
  plateNo: string;
  violation: string;
  enforcement: string;
  location: string;
  officer: string;
  recordedAt: Date | null;
  amount: number;
  payment: string;
  release: string;
  impound: string;
};

export type ReportData = {
  period: ReportPeriod;
  recorded: number;
  clamped: number;
  ticketed: number;
  impoundedDirect: number;
  finesAssessed: number;
  settledCount: number;
  settledAmount: number;
  awaitingVerification: number;
  unpaid: number;
  wentToImpound: number;
  releasedCount: number;
  avgReleaseMinutes: number | null;
  byViolation: CountRow[];
  byLocation: CountRow[];
  byOfficer: CountRow[];
  byVehicleType: CountRow[];
  days: DayRow[];
  records: RecordRow[];
};

type Violation = DocumentData & { id: string };

/** Firestore Timestamp, Date, millis or ISO string → Date. */
export const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === "number" || typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const text = (value: unknown, fallback = "—"): string => {
  const s = String(value ?? "").trim();
  return s && s !== "null" && s !== "undefined" ? s : fallback;
};

const IMPOUND_STATES = new Set([
  "subject to impound",
  "scheduled for impounding",
  "impounded",
  "released",
]);

const amountOf = (v: Violation): number =>
  amountDue(Number(v.fineAmount) || 0, impoundFeeDue(v.impoundStatus, v.impoundFee));

const countBy = (items: Violation[], key: (v: Violation) => string): CountRow[] => {
  const map = new Map<string, number>();
  items.forEach((v) => {
    const name = key(v);
    map.set(name, (map.get(name) ?? 0) + 1);
  });
  const total = items.length || 1;
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count, share: count / total }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

export const buildReport = (violations: Violation[], period: ReportPeriod): ReportData => {
  const s = period.start.getTime();
  const e = period.end.getTime();
  const inPeriod = (d: Date | null) => !!d && d.getTime() >= s && d.getTime() < e;

  const recorded = violations.filter((v) => inPeriod(toDate(v.recordedAt)));

  const settled = violations.filter(
    (v) =>
      String(v.paymentStatus) === "Verified" &&
      inPeriod(toDate(v.verifiedAt) ?? toDate(v.paidAt))
  );
  const released = violations.filter(
    (v) => String(v.releaseStatus) === "Released" && inPeriod(toDate(v.releasedAt))
  );
  const durations = released
    .map((v) => Number(v.releaseDurationMinutes))
    .filter((m) => Number.isFinite(m) && m >= 0);

  // Day-by-day rows (weekly and monthly)
  const days: DayRow[] = [];
  if (period.kind !== "daily") {
    for (let d = period.start; d < period.end; d = addDays(d, 1)) {
      const next = addDays(d, 1).getTime();
      const within = (x: Date | null) =>
        !!x && x.getTime() >= d.getTime() && x.getTime() < next;
      days.push({
        date: d,
        label:
          period.kind === "weekly"
            ? fmt(d, { weekday: "short", month: "short", day: "numeric" })
            : fmt(d, { month: "short", day: "numeric" }),
        recorded: recorded.filter((v) => within(toDate(v.recordedAt))).length,
        settled: settled.filter((v) => within(toDate(v.verifiedAt) ?? toDate(v.paidAt))).length,
        released: released.filter((v) => within(toDate(v.releasedAt))).length,
      });
    }
  }

  const enforcementLabel = (v: Violation) => {
    const t = String(v.enforcementType ?? "").toLowerCase();
    if (t === "clamped") return "Clamped";
    if (t === "ticketed") return "Ticketed";
    if (t === "impounded") return "Impounded (towed)";
    return "—";
  };

  return {
    period,
    recorded: recorded.length,
    clamped: recorded.filter((v) => v.enforcementType === "clamped").length,
    ticketed: recorded.filter((v) => v.enforcementType === "ticketed").length,
    impoundedDirect: recorded.filter((v) => v.enforcementType === "impounded").length,
    finesAssessed: recorded.reduce((sum, v) => sum + amountOf(v), 0),
    settledCount: settled.length,
    settledAmount: settled.reduce(
      (sum, v) => sum + (Number(v.totalPaid) > 0 ? Number(v.totalPaid) : amountOf(v)),
      0
    ),
    awaitingVerification: recorded.filter(
      (v) => String(v.paymentStatus) === "Pending Verification"
    ).length,
    unpaid: recorded.filter((v) => String(v.paymentStatus ?? "Unpaid") === "Unpaid").length,
    wentToImpound: recorded.filter((v) =>
      IMPOUND_STATES.has(String(v.impoundStatus ?? "").toLowerCase().trim())
    ).length,
    releasedCount: released.length,
    avgReleaseMinutes: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    byViolation: countBy(recorded, (v) => text(v.violationType, "Unspecified")),
    byLocation: countBy(recorded, (v) => text(v.location, "Unspecified")),
    byOfficer: countBy(recorded, (v) => text(v.officer, "Unassigned")),
    byVehicleType: countBy(recorded, (v) => text(v.vehicleType, "Unspecified")),
    days,
    records: recorded
      .map((v) => ({
        cin: text(v.cin),
        plateNo: text(v.plateNo),
        violation: text(v.violationType),
        enforcement: enforcementLabel(v),
        location: text(v.location),
        officer: text(v.officer),
        recordedAt: toDate(v.recordedAt),
        amount: amountOf(v),
        payment: text(v.paymentStatus, "Unpaid"),
        release: text(v.releaseStatus, "Pending"),
        impound:
          IMPOUND_STATES.has(String(v.impoundStatus ?? "").toLowerCase().trim())
            ? text(v.impoundStatus)
            : "—",
      }))
      .sort((a, b) => (a.recordedAt?.getTime() ?? 0) - (b.recordedAt?.getTime() ?? 0)),
  };
};

// ---------------------------------------------------------------------------
// FORMATTING
// ---------------------------------------------------------------------------
export const peso = (n: number): string =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** jsPDF's built-in fonts have no ₱ glyph. */
const pesoPdf = (n: number): string =>
  `PHP ${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatMinutes = (m: number | null): string => {
  if (m === null) return "—";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
};

export const formatDateTime = (d: Date | null): string =>
  d
    ? d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** jsPDF's built-in fonts drop "·", "–", "—" and curly quotes. */
const pdfSafe = (value: unknown): string =>
  String(value ?? "")
    .replace(/[·•]/g, "|")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/₱/g, "PHP ");

export const reportFileName = (data: ReportData, ext: "pdf" | "xlsx"): string =>
  `MTPB_${REPORT_DEFS[data.period.kind].title.replace(/\s+/g, "_")}_${data.period.fileTag}.${ext}`;

/** Key figures, in the order the report lists them. */
export const summaryRows = (data: ReportData, money: (n: number) => string = peso) => [
  ["Violations recorded", String(data.recorded)],
  ["   Clamped", String(data.clamped)],
  ["   Ticketed", String(data.ticketed)],
  ["   Impounded (towed)", String(data.impoundedDirect)],
  ["Fines assessed", money(data.finesAssessed)],
  ["Payments settled", `${data.settledCount} (${money(data.settledAmount)})`],
  ["Awaiting payment verification", String(data.awaitingVerification)],
  ["Still unpaid", String(data.unpaid)],
  ["Went to impound (Subject to Impound or later)", String(data.wentToImpound)],
  ["Vehicles released", String(data.releasedCount)],
  ["Average time from payment to release", formatMinutes(data.avgReleaseMinutes)],
];

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
export const downloadReportPdf = (data: ReportData, preparedBy: string): void => {
  const def = REPORT_DEFS[data.period.kind];
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Header band (same look as Export Center)
  const headerHeight = 84;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, headerHeight, "F");
  doc.setFillColor(29, 78, 216);
  doc.rect(0, headerHeight, pageWidth, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("MTPB", margin, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(200, 210, 230);
  doc.text("Manila Traffic and Parking Bureau", margin, 54);
  doc.text("Integrated Enforcement System | Sector 3", margin, 67);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(def.title.toUpperCase(), pageWidth - margin, 40, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 210, 230);
  doc.text(pdfSafe(data.period.label), pageWidth - margin, 58, { align: "right" });

  let y = headerHeight + 26;
  doc.setTextColor(75, 85, 99);
  doc.setFontSize(9);
  doc.text(
    pdfSafe(`Generated ${formatDateTime(new Date())} by ${preparedBy} (Record Officer)`),
    margin,
    y
  );
  y += 14;

  /** Starts a section; moves to a new page when its table won't fit. */
  const section = (title: string, rows = 4) => {
    const needed = 36 + Math.min(rows + 1, 12) * 19;
    if (y + needed > pageHeight - 50) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text(title, margin, y + 10);
    y += 16;
  };

  const table = (head: string[], body: (string | number)[][], opts: object = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.length
        ? body.map((row) => row.map((cell) => (typeof cell === "string" ? pdfSafe(cell) : cell)))
        : ([[{ content: "No records for this period.", colSpan: head.length }]] as never),
      rowPageBreak: "avoid",
      margin: { left: margin, right: margin },
      styles: { fontSize: 8.5, cellPadding: 5, textColor: [31, 41, 55] },
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      theme: "grid",
      ...opts,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  };

  section("Summary", 11);
  table(
    ["Item", "Value"],
    summaryRows(data, pesoPdf),
    { columnStyles: { 1: { halign: "right", cellWidth: 170 } } }
  );

  const breakdown = (title: string, label: string, rows: CountRow[], limit?: number) => {
    const shown = limit ? rows.slice(0, limit) : rows;
    section(title, shown.length);
    table(
      [label, "Count", "Share"],
      shown.map((r) => [r.name, r.count, pct(r.share)]),
      { columnStyles: { 1: { halign: "right", cellWidth: 60 }, 2: { halign: "right", cellWidth: 60 } } }
    );
  };

  breakdown("Violations by type", "Violation", data.byViolation);
  breakdown("Top locations", "Location", data.byLocation, 10);
  breakdown("Violations by enforcer", "Enforcer", data.byOfficer);

  if (data.days.length) {
    section("Day-by-day", data.days.length);
    table(
      ["Date", "Recorded", "Settled", "Released"],
      data.days.map((d) => [d.label, d.recorded, d.settled, d.released]),
      {
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
        },
      }
    );
  }

  section(`Violations recorded (${data.records.length})`, Math.max(data.records.length, 1));
  table(
    ["CIN", "Plate", "Violation", "Type", "Location", "Recorded", "Amount", "Payment"],
    data.records.map((r) => [
      r.cin,
      r.plateNo,
      r.violation,
      r.enforcement,
      r.location,
      formatDateTime(r.recordedAt),
      pesoPdf(r.amount),
      r.payment,
    ]),
    {
      styles: { fontSize: 7.5, cellPadding: 4, textColor: [31, 41, 55] },
      columnStyles: {
        0: { cellWidth: 74 },
        1: { cellWidth: 52 },
        5: { cellWidth: 76 },
        6: { cellWidth: 64, halign: "right" },
        7: { cellWidth: 62 },
      },
    }
  );

  // Signatures
  if (y > pageHeight - 110) {
    doc.addPage();
    y = margin;
  }
  y += 30;
  const colW = (pageWidth - margin * 2 - 40) / 2;
  [
    ["Prepared by", `${preparedBy}`, "Record Officer"],
    ["Noted by", "", "Officer in Charge"],
  ].forEach(([caption, name, role], i) => {
    const x = margin + i * (colW + 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    doc.text(caption, x, y);
    doc.setDrawColor(156, 163, 175);
    doc.line(x, y + 34, x + colW, y + 34);
    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", "bold");
    if (name) doc.text(pdfSafe(name), x, y + 30);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text(role, x, y + 46);
  });

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(pdfSafe(`${def.title} | ${data.period.label}`), margin, pageHeight - 20);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, pageHeight - 20, { align: "right" });
  }

  doc.save(reportFileName(data, "pdf"));
};

// ---------------------------------------------------------------------------
// EXCEL
// ---------------------------------------------------------------------------
export const downloadReportExcel = (data: ReportData, preparedBy: string): void => {
  const def = REPORT_DEFS[data.period.kind];
  const wb = XLSX.utils.book_new();

  const sheet = (rows: (string | number)[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    return ws;
  };

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ["MTPB — Manila Traffic and Parking Bureau · Sector 3"],
        [def.title],
        ["Period", data.period.label],
        ["Generated", `${formatDateTime(new Date())} by ${preparedBy}`],
        [],
        ["Item", "Value"],
        ...summaryRows(data).map(([label, value]) => [
          label,
          /^\d+$/.test(value) ? Number(value) : value,
        ]),
      ],
      [46, 28]
    ),
    "Summary"
  );

  const breakdownSheet = (label: string, rows: CountRow[]) =>
    sheet(
      [[label, "Count", "Share"], ...rows.map((r) => [r.name, r.count, pct(r.share)])],
      [40, 10, 10]
    );
  XLSX.utils.book_append_sheet(wb, breakdownSheet("Violation", data.byViolation), "By Violation");
  XLSX.utils.book_append_sheet(wb, breakdownSheet("Location", data.byLocation), "By Location");
  XLSX.utils.book_append_sheet(wb, breakdownSheet("Enforcer", data.byOfficer), "By Enforcer");
  XLSX.utils.book_append_sheet(wb, breakdownSheet("Vehicle type", data.byVehicleType), "By Vehicle Type");

  if (data.days.length) {
    XLSX.utils.book_append_sheet(
      wb,
      sheet(
        [
          ["Date", "Recorded", "Settled", "Released"],
          ...data.days.map((d) => [d.label, d.recorded, d.settled, d.released]),
        ],
        [18, 10, 10, 10]
      ),
      "Day by Day"
    );
  }

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ["CIN", "Plate No.", "Violation", "Type", "Location", "Enforcer", "Recorded", "Amount (₱)", "Payment", "Impound", "Release"],
        ...data.records.map((r) => [
          r.cin,
          r.plateNo,
          r.violation,
          r.enforcement,
          r.location,
          r.officer,
          formatDateTime(r.recordedAt),
          r.amount,
          r.payment,
          r.impound,
          r.release,
        ]),
      ],
      [16, 12, 26, 16, 30, 20, 22, 12, 20, 22, 14]
    ),
    "Violations"
  );

  XLSX.writeFile(wb, reportFileName(data, "xlsx"));
};
