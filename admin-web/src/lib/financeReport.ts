/* ------------------------------------------------------------------
   FINANCE COLLECTION REPORTS (Finance → All Reports)

   Summary reports built from the `payments` collection:
     - Daily Collection Report    (one day, hour by hour)
     - Weekly Collection Report   (Monday–Sunday, day by day)
     - Monthly Collection Report  (calendar month, day by day)

   A payment belongs to the period it was RECEIVED in (paidAt, else
   createdAt). Per payment status:
     - Verified              → collected and confirmed
     - Pending Verification  → received, waiting for Payment Verification
     - Rejected              → not counted in any total, listed separately
   "Total received" = Verified + Pending Verification.

   Finance staff only see their own location (City Hall, or Central +
   Online/GCash) — same rule as the other Finance pages
   (lib/paymentLocation.ts). OIC / IT Admin see all.

   Period helpers, dates and peso formatting come from
   lib/enforcementReport.ts (the Record Officer's reports).
------------------------------------------------------------------ */
import type { DocumentData } from "firebase/firestore";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatDateTime,
  peso,
  toDate,
  type ReportKind,
  type ReportPeriod,
} from "./enforcementReport";
import {
  derivePaymentLocation,
  PAYMENT_LOCATION_LABELS,
  type PaymentLocation,
} from "./paymentLocation";
import { renderBreakdownChart, renderGroupedBars } from "./reportCharts";

export const FINANCE_REPORT_DEFS: Record<
  ReportKind,
  { title: string; description: string }
> = {
  daily: {
    title: "Daily Collection Report",
    description: "Payments received in one day, hour by hour, with OR numbers.",
  },
  weekly: {
    title: "Weekly Collection Report",
    description: "The week's collections with a day-by-day breakdown.",
  },
  monthly: {
    title: "Monthly Collection Report",
    description: "The month's collections by location, method and charge type.",
  },
};

/** Chart colors — the validated pair used by the other reports. */
export const FINANCE_SERIES = {
  verified: { label: "Verified", color: "#2a78d6" },
  pending: { label: "Awaiting verification", color: "#eb6834" },
};

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
export type PaymentState = "Verified" | "Pending Verification" | "Rejected";
export type ChargeType = "Clamp" | "Impound";

export type PaymentItem = {
  id: string;
  referenceNumber: string;
  orNumber: string;
  cin: string;
  plateNo: string;
  amount: number;
  method: "Cash" | "GCash";
  location: PaymentLocation;
  chargeType: ChargeType;
  state: PaymentState;
  receivedAt: Date | null;
  verifiedAt: Date | null;
  receivedBy: string;
};

/** amount = pesos; count = payments; share = of the amount. */
export type AmountRow = { name: string; count: number; amount: number; share: number };

export type TrendRow = {
  label: string;
  verified: number; // pesos
  pending: number; // pesos
  count: number;
};

export type FinanceReportData = {
  period: ReportPeriod;
  scopeLabel: string;
  received: number; // pesos, verified + pending
  receivedCount: number;
  verified: number;
  verifiedCount: number;
  pending: number;
  pendingCount: number;
  rejected: number;
  rejectedCount: number;
  cash: number;
  gcash: number;
  /** OR numbers issued on cash payments in the period */
  orFirst: string | null;
  orLast: string | null;
  orCount: number;
  byLocation: AmountRow[];
  byMethod: AmountRow[];
  byCharge: AmountRow[];
  byStaff: AmountRow[];
  /** Daily → hours; weekly / monthly → days */
  trend: TrendRow[];
  payments: PaymentItem[];
};

// ---------------------------------------------------------------------------
// NORMALIZE
// ---------------------------------------------------------------------------
const text = (value: unknown, fallback = "—"): string => {
  const s = String(value ?? "").trim();
  return s && s !== "null" && s !== "undefined" ? s : fallback;
};

export const paymentState = (data: DocumentData): PaymentState => {
  const s = String(data.verificationStatus ?? data.status ?? "").toLowerCase().trim();
  if (["verified", "succeeded", "approved", "paid"].includes(s)) return "Verified";
  if (s === "rejected" || s === "failed") return "Rejected";
  return "Pending Verification";
};

const chargeTypeOf = (data: DocumentData): ChargeType => {
  const t = String(data.chargeType ?? "").toLowerCase();
  if (t === "impound") return "Impound";
  if (t === "clamp") return "Clamp";
  return /^IMP-/i.test(String(data.cin ?? "")) || Number(data.impoundFee) > 0 ? "Impound" : "Clamp";
};

export const normalizePayment = (id: string, data: DocumentData): PaymentItem => {
  const isGcash = String(data.method ?? "").toLowerCase().replace(/\s+/g, "") === "gcash";
  return {
    id,
    referenceNumber: text(data.referenceNumber, id),
    orNumber: text(data.orNumber),
    cin: text(data.cin),
    plateNo: text(data.plateNo ?? data.plateNumber),
    amount: Number(data.totalAmount ?? data.amount ?? 0) || 0,
    method: isGcash ? "GCash" : "Cash",
    location: derivePaymentLocation(data.method, data.paymentLocation ?? data.location),
    chargeType: chargeTypeOf(data),
    state: paymentState(data),
    receivedAt: toDate(data.paidAt) ?? toDate(data.createdAt),
    verifiedAt: toDate(data.verifiedAt),
    receivedBy: isGcash ? "Violator app (GCash)" : text(data.recordedBy, "Unrecorded"),
  };
};

// ---------------------------------------------------------------------------
// COMPUTE
// ---------------------------------------------------------------------------
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", opts);

const sumBy = (items: PaymentItem[], key: (p: PaymentItem) => string): AmountRow[] => {
  const map = new Map<string, { count: number; amount: number }>();
  items.forEach((p) => {
    const name = key(p);
    const row = map.get(name) ?? { count: 0, amount: 0 };
    row.count += 1;
    row.amount += p.amount;
    map.set(name, row);
  });
  const total = items.reduce((s, p) => s + p.amount, 0) || 1;
  return Array.from(map.entries())
    .map(([name, r]) => ({ name, ...r, share: r.amount / total }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
};

/** OR-2026-00031 → 31 (for ordering); non-matching → NaN */
const orSeq = (or: string): number => {
  const m = or.match(/(\d{4})-(\d+)$/);
  return m ? Number(m[1]) * 1e7 + Number(m[2]) : NaN;
};

export const buildFinanceReport = (
  all: PaymentItem[],
  period: ReportPeriod,
  scopeLabel: string
): FinanceReportData => {
  const s = period.start.getTime();
  const e = period.end.getTime();
  const inPeriod = all.filter(
    (p) => p.receivedAt && p.receivedAt.getTime() >= s && p.receivedAt.getTime() < e
  );
  const counted = inPeriod.filter((p) => p.state !== "Rejected");
  const verified = counted.filter((p) => p.state === "Verified");
  const pending = counted.filter((p) => p.state === "Pending Verification");
  const rejected = inPeriod.filter((p) => p.state === "Rejected");
  const total = (items: PaymentItem[]) => items.reduce((sum, p) => sum + p.amount, 0);

  // Trend: hours (daily) or days (weekly / monthly)
  const buckets: { label: string; from: number; to: number }[] = [];
  if (period.kind === "daily") {
    for (let h = 0; h < 24; h++) {
      const from = new Date(
        period.start.getFullYear(),
        period.start.getMonth(),
        period.start.getDate(),
        h
      );
      buckets.push({
        label: from.toLocaleTimeString("en-US", { hour: "numeric" }),
        from: from.getTime(),
        to: from.getTime() + 3600000,
      });
    }
  } else {
    for (let d = period.start; d < period.end; d = addDays(d, 1)) {
      buckets.push({
        label:
          period.kind === "weekly"
            ? fmt(d, { weekday: "short", month: "short", day: "numeric" })
            : fmt(d, { month: "short", day: "numeric" }),
        from: d.getTime(),
        to: addDays(d, 1).getTime(),
      });
    }
  }
  const trend: TrendRow[] = buckets.map((b) => {
    const within = counted.filter((p) => {
      const t = p.receivedAt!.getTime();
      return t >= b.from && t < b.to;
    });
    return {
      label: b.label,
      verified: total(within.filter((p) => p.state === "Verified")),
      pending: total(within.filter((p) => p.state === "Pending Verification")),
      count: within.length,
    };
  });

  // OR range (cash, not rejected)
  const ors = counted
    .filter((p) => p.method === "Cash" && p.orNumber !== "—")
    .map((p) => p.orNumber)
    .sort((a, b) => {
      const x = orSeq(a);
      const y = orSeq(b);
      return Number.isNaN(x) || Number.isNaN(y) ? a.localeCompare(b) : x - y;
    });

  return {
    period,
    scopeLabel,
    received: total(counted),
    receivedCount: counted.length,
    verified: total(verified),
    verifiedCount: verified.length,
    pending: total(pending),
    pendingCount: pending.length,
    rejected: total(rejected),
    rejectedCount: rejected.length,
    cash: total(counted.filter((p) => p.method === "Cash")),
    gcash: total(counted.filter((p) => p.method === "GCash")),
    orFirst: ors[0] ?? null,
    orLast: ors[ors.length - 1] ?? null,
    orCount: ors.length,
    byLocation: sumBy(counted, (p) => PAYMENT_LOCATION_LABELS[p.location]),
    byMethod: sumBy(counted, (p) => p.method),
    byCharge: sumBy(counted, (p) => (p.chargeType === "Impound" ? "Impound fee" : "Clamp fine")),
    byStaff: sumBy(counted, (p) => p.receivedBy),
    trend,
    payments: [...inPeriod].sort(
      (a, b) => (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0)
    ),
  };
};

// ---------------------------------------------------------------------------
// FORMATTING
// ---------------------------------------------------------------------------
/** ₱1,500 / ₱12.5k — for chart axes. */
export const pesoShort = (n: number): string => {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `₱${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return `₱${n.toLocaleString("en-PH")}`;
};

/** jsPDF's built-in fonts have no ₱ glyph. */
const pesoPdf = (n: number): string =>
  `PHP ${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (share: number) => `${Math.round(share * 100)}%`;

const pdfSafe = (value: unknown): string =>
  String(value ?? "")
    .replace(/[·•]/g, "|")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/₱/g, "PHP ");

export const orRangeText = (data: FinanceReportData): string =>
  data.orCount === 0
    ? "No OR issued"
    : data.orFirst === data.orLast
      ? `${data.orFirst} (1 receipt)`
      : `${data.orFirst} – ${data.orLast} (${data.orCount} receipts)`;

export const financeFileName = (data: FinanceReportData, ext: "pdf" | "xlsx"): string =>
  `MTPB_${FINANCE_REPORT_DEFS[data.period.kind].title.replace(/\s+/g, "_")}_${data.period.fileTag}.${ext}`;

/** Key figures, in the order the report lists them. */
export const financeSummaryRows = (
  data: FinanceReportData,
  money: (n: number) => string = peso
): [string, string][] => [
  ["Coverage", data.scopeLabel],
  ["Total received", `${money(data.received)} (${data.receivedCount} payments)`],
  ["   Verified", `${money(data.verified)} (${data.verifiedCount})`],
  ["   Awaiting verification", `${money(data.pending)} (${data.pendingCount})`],
  ["Cash", money(data.cash)],
  ["GCash (online)", money(data.gcash)],
  ["OR numbers issued", orRangeText(data)],
  ["Rejected (not counted)", `${money(data.rejected)} (${data.rejectedCount})`],
];

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
export const downloadFinancePdf = (
  data: FinanceReportData,
  preparedBy: string,
  preparedByRole: string
): void => {
  const def = FINANCE_REPORT_DEFS[data.period.kind];
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Header band (same look as the other reports)
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
  doc.text("Integrated Enforcement System | Finance", margin, 67);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(def.title.toUpperCase(), pageWidth - margin, 40, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 210, 230);
  doc.text(pdfSafe(data.period.label), pageWidth - margin, 58, { align: "right" });
  doc.text(pdfSafe(data.scopeLabel), pageWidth - margin, 72, { align: "right" });

  let y = headerHeight + 26;
  doc.setTextColor(75, 85, 99);
  doc.setFontSize(9);
  doc.text(
    pdfSafe(`Generated ${formatDateTime(new Date())} by ${preparedBy} (${preparedByRole})`),
    margin,
    y
  );
  y += 14;

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
        : ([[{ content: "No payments for this period.", colSpan: head.length }]] as never),
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

  const chart = (title: string, canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const w = pageWidth - margin * 2;
    const h = (w * canvas.height) / canvas.width;
    if (y + h + 30 > pageHeight - 50) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text(title, margin, y + 10);
    y += 18;
    doc.addImage(canvas.toDataURL("image/png"), "PNG", margin, y, w, h);
    y += h + 18;
  };

  const safeChart = (draw: () => HTMLCanvasElement): HTMLCanvasElement | null => {
    try {
      return draw();
    } catch (err) {
      console.warn("Chart not added to the PDF:", err);
      return null;
    }
  };

  section("Summary", 8);
  table(["Item", "Value"], financeSummaryRows(data, pesoPdf), {
    columnStyles: { 1: { halign: "right", cellWidth: 230 } },
  });

  if (data.trend.some((t) => t.verified || t.pending)) {
    chart(
      data.period.kind === "daily" ? "Hour by hour: amount received" : "Day by day: amount received",
      safeChart(() =>
        renderGroupedBars(
          data.trend.map((t) => ({ label: t.label, values: [t.verified, t.pending] })),
          [FINANCE_SERIES.verified, FINANCE_SERIES.pending],
          { height: 320, formatTick: pesoShort }
        )
      )
    );
  }

  const breakdown = (title: string, label: string, rows: AmountRow[], withChart = false) => {
    if (withChart && rows.length > 0) {
      chart(
        title,
        safeChart(() =>
          renderBreakdownChart(
            rows.map((r) => ({ name: r.name, count: r.amount, share: r.share })),
            { limit: 10, formatValue: pesoShort }
          )
        )
      );
      if (y + 40 + Math.min(rows.length + 1, 12) * 19 > pageHeight - 50) {
        doc.addPage();
        y = margin;
      }
    } else {
      section(title, rows.length);
    }
    table(
      [label, "Payments", "Amount", "Share"],
      rows.map((r) => [r.name, r.count, pesoPdf(r.amount), pct(r.share)]),
      {
        columnStyles: {
          1: { halign: "right", cellWidth: 64 },
          2: { halign: "right", cellWidth: 110 },
          3: { halign: "right", cellWidth: 52 },
        },
      }
    );
  };

  breakdown("By location", "Location", data.byLocation, true);
  breakdown("By payment method", "Method", data.byMethod);
  breakdown("By charge type", "Charge", data.byCharge);
  breakdown("By staff (received by)", "Received by", data.byStaff);

  if (data.period.kind !== "daily") {
    section("Day-by-day", data.trend.length);
    table(
      ["Date", "Payments", "Verified", "Awaiting verification"],
      data.trend.map((t) => [t.label, t.count, pesoPdf(t.verified), pesoPdf(t.pending)]),
      {
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
        },
      }
    );
  }

  section(`Payments received (${data.payments.length})`, Math.max(data.payments.length, 1));
  table(
    ["Received", "Reference", "OR No.", "CIN", "Plate", "Charge", "Method", "Amount", "Status"],
    data.payments.map((p) => [
      formatDateTime(p.receivedAt),
      p.referenceNumber,
      p.orNumber,
      p.cin,
      p.plateNo,
      p.chargeType,
      p.method,
      pesoPdf(p.amount),
      p.state,
    ]),
    {
      styles: { fontSize: 7, cellPadding: 3.5, textColor: [31, 41, 55] },
      columnStyles: {
        0: { cellWidth: 70 },
        7: { halign: "right", cellWidth: 62 },
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
    ["Prepared by", preparedBy, preparedByRole],
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

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(pdfSafe(`${def.title} | ${data.period.label}`), margin, pageHeight - 20);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, pageHeight - 20, { align: "right" });
  }

  doc.save(financeFileName(data, "pdf"));
};

// ---------------------------------------------------------------------------
// EXCEL
// ---------------------------------------------------------------------------
export const downloadFinanceExcel = (data: FinanceReportData, preparedBy: string): void => {
  const def = FINANCE_REPORT_DEFS[data.period.kind];
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
        ["MTPB — Manila Traffic and Parking Bureau · Finance"],
        [def.title],
        ["Period", data.period.label],
        ["Generated", `${formatDateTime(new Date())} by ${preparedBy}`],
        [],
        ["Item", "Value"],
        ...financeSummaryRows(data),
        [],
        ["Totals (₱)", ""],
        ["Total received", data.received],
        ["Verified", data.verified],
        ["Awaiting verification", data.pending],
        ["Cash", data.cash],
        ["GCash (online)", data.gcash],
        ["Rejected (not counted)", data.rejected],
      ],
      [34, 44]
    ),
    "Summary"
  );

  const amountSheet = (label: string, rows: AmountRow[]) =>
    sheet(
      [
        [label, "Payments", "Amount (₱)", "Share"],
        ...rows.map((r) => [r.name, r.count, r.amount, pct(r.share)]),
      ],
      [32, 10, 14, 8]
    );
  XLSX.utils.book_append_sheet(wb, amountSheet("Location", data.byLocation), "By Location");
  XLSX.utils.book_append_sheet(wb, amountSheet("Method", data.byMethod), "By Method");
  XLSX.utils.book_append_sheet(wb, amountSheet("Charge", data.byCharge), "By Charge");
  XLSX.utils.book_append_sheet(wb, amountSheet("Received by", data.byStaff), "By Staff");

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        [data.period.kind === "daily" ? "Hour" : "Date", "Payments", "Verified (₱)", "Awaiting verification (₱)"],
        ...data.trend.map((t) => [t.label, t.count, t.verified, t.pending]),
      ],
      [18, 10, 14, 24]
    ),
    data.period.kind === "daily" ? "Hour by Hour" : "Day by Day"
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        [
          "Received",
          "Reference No.",
          "OR No.",
          "CIN",
          "Plate No.",
          "Charge",
          "Method",
          "Location",
          "Received by",
          "Amount (₱)",
          "Status",
          "Verified",
        ],
        ...data.payments.map((p) => [
          formatDateTime(p.receivedAt),
          p.referenceNumber,
          p.orNumber,
          p.cin,
          p.plateNo,
          p.chargeType,
          p.method,
          PAYMENT_LOCATION_LABELS[p.location],
          p.receivedBy,
          p.amount,
          p.state,
          formatDateTime(p.verifiedAt),
        ]),
      ],
      [22, 18, 18, 16, 12, 10, 8, 16, 22, 12, 20, 22]
    ),
    "Payments"
  );

  XLSX.writeFile(wb, financeFileName(data, "xlsx"));
};
