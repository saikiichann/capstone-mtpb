/* ------------------------------------------------------------------
   FIELD ACTIVITY — the live feed on the Field Updates pages
   (OIC and Supervisor).

   Built from records the system already writes, so it needs nothing
   new from the enforcer app:
     violations (clamped)  → "clamped"            recordedAt
     impoundRecords        → "impounded"          createdAt / ticketDate
     payments              → "paid"               paidAt / createdAt
     releaseLog            → "released"           releasedAt
     operationSchedules    → scheduled / started / completed / cancelled

   Every staff role can read these collections (firestore.rules), and the
   feed only reads — it never writes. The same events feed the
   notification bell and the sidebar badges (lib/staffAlerts.ts); all of
   them share one listener per collection (lib/liveCollections.ts).
------------------------------------------------------------------ */
import { useMemo } from "react";
import type { DocumentData } from "firebase/firestore";
import { useLiveCollection, type LiveDoc } from "./liveCollections";

export type ActivityKind = "clamp" | "impound" | "payment" | "release" | "operation";

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  clamp: "Clamp",
  impound: "Impound",
  payment: "Payment",
  release: "Release",
  operation: "Operation",
};

export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  time: Date;
  title: string;
  detail: string;
  /** The record it came from (e.g. a payment's status, for the bell). */
  raw: DocumentData;
};

export type Source = "violations" | "impoundRecords" | "payments" | "releaseLog" | "operationSchedules";
const SOURCES: Source[] = [
  "violations",
  "impoundRecords",
  "payments",
  "releaseLog",
  "operationSchedules",
];

type Rows = LiveDoc[];

/* ---------------- helpers ---------------- */
const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date; seconds?: number };
  if (typeof t.toDate === "function") {
    try {
      return t.toDate();
    } catch {
      return null;
    }
  }
  if (typeof t.seconds === "number") return new Date(t.seconds * 1000);
  return null;
};

const peso = (n: unknown) => `₱${Number(n ?? 0).toLocaleString()}`;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const join = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(" · ");

const isClampViolation = (d: DocumentData) =>
  d.enforcementType
    ? d.enforcementType === "clamped"
    : str(d.cin).toUpperCase().startsWith("CLMP");

/* ---------------- record → events ---------------- */
const fromViolation = (id: string, d: DocumentData): ActivityEvent[] => {
  const officer = str(d.officer ?? d.officerName ?? d.enforcerName) || "Enforcer";
  // Impounded straight from the enforcer app (no Add Impound record).
  if (d.enforcementType === "impounded") {
    const time = toDate(d.recordedAt ?? d.createdAt);
    if (d.impoundRecordId || !time) return [];
    return [
      {
        id: `vi-${id}`,
        kind: "impound",
        time,
        title: `${officer} impounded ${str(d.plateNo) || "a vehicle"}`,
        detail: join(d.cin, d.violationType, d.location, d.barangay),
        raw: d,
      },
    ];
  }
  if (!isClampViolation(d)) return [];
  const time = toDate(d.recordedAt ?? d.createdAt);
  if (!time) return [];
  return [
    {
      id: `v-${id}`,
      kind: "clamp",
      time,
      title: `${officer} clamped ${str(d.plateNo) || "a vehicle"}`,
      detail: join(d.cin, d.violationType, d.location, d.barangay),
      raw: d,
    },
  ];
};

const fromImpound = (id: string, d: DocumentData): ActivityEvent[] => {
  const time = toDate(d.createdAt ?? d.ticketDate);
  if (!time) return [];
  return [
    {
      id: `i-${id}`,
      kind: "impound",
      time,
      title: `${str(d.plateNo) || "A vehicle"} impounded`,
      detail: join(
        d.uovrNo ? `UOVR ${d.uovrNo}` : "",
        d.initialViolation ?? d.violationType,
        d.location,
        d.impoundFee ? `Fee ${peso(d.impoundFee)}` : "",
        d.receivedBy ? `Received by ${d.receivedBy}` : ""
      ),
      raw: d,
    },
  ];
};

const fromPayment = (id: string, d: DocumentData): ActivityEvent[] => {
  const time = toDate(d.paidAt ?? d.createdAt);
  if (!time) return [];
  const amount = d.totalAmount ?? d.amount;
  const pending = str(d.status).toLowerCase() === "pending verification";
  return [
    {
      id: `p-${id}`,
      kind: "payment",
      time,
      title: `${str(d.plateNo) || "A vehicle"} paid ${peso(amount)}${
        d.method ? ` via ${d.method}` : ""
      }`,
      detail: join(
        d.cin,
        d.chargeType,
        d.referenceNumber ?? d.paymentReference,
        pending ? "Pending verification" : ""
      ),
      raw: d,
    },
  ];
};

const fromRelease = (id: string, d: DocumentData): ActivityEvent[] => {
  const time = toDate(d.releasedAt);
  if (!time) return [];
  return [
    {
      id: `r-${id}`,
      kind: "release",
      time,
      title: `${str(d.plateNo) || "A vehicle"} released`,
      detail: join(
        d.cin,
        d.orderId ? `Order ${d.orderId}` : "",
        d.releasedBy ? `by ${d.releasedBy}` : ""
      ),
      raw: d,
    },
  ];
};

const fromOperation = (id: string, d: DocumentData): ActivityEvent[] => {
  const name = str(d.title) || "Operation";
  const where = join(d.location, d.sector);
  const leader = d.leaderName ? `Leader: ${d.leaderName}` : "";
  const out: ActivityEvent[] = [];
  const push = (key: string, at: unknown, title: string, detail: string) => {
    const time = toDate(at);
    if (time) out.push({ id: `o-${id}-${key}`, kind: "operation", time, title, detail, raw: d });
  };
  push(
    "new",
    d.createdAt,
    `Scheduled: ${name}`,
    join(d.date, d.timeStart && `${d.timeStart}–${d.timeEnd}`, where, d.createdBy && `by ${d.createdBy}`)
  );
  push("start", d.startedAt, `Started: ${name}`, join(where, leader));
  push(
    "done",
    d.completedAt,
    `Completed: ${name}`,
    join(
      `${Number(d.vehiclesClamped ?? 0)} vehicle${d.vehiclesClamped === 1 ? "" : "s"} clamped`,
      where,
      leader,
      d.resultRemarks
    )
  );
  push("cancel", d.cancelledAt, `Cancelled: ${name}`, join(d.cancelReason, where));
  return out;
};

const BUILDERS: Record<Source, (id: string, d: DocumentData) => ActivityEvent[]> = {
  violations: fromViolation,
  impoundRecords: fromImpound,
  payments: fromPayment,
  releaseLog: fromRelease,
  operationSchedules: fromOperation,
};

/* ---------------- events + hooks ---------------- */
/** Every event from the loaded records, newest first. */
export function buildActivity(rows: Partial<Record<Source, Rows>>): ActivityEvent[] {
  const all: ActivityEvent[] = [];
  SOURCES.forEach((source) =>
    (rows[source] ?? []).forEach(({ id, data }) => all.push(...BUILDERS[source](id, data)))
  );
  return all.sort((a, b) => b.time.getTime() - a.time.getTime());
}

/** The live records behind the events. Pass false to load nothing (roles without a feed). */
export function useActivityRows(enabled = true): {
  rows: Partial<Record<Source, Rows>>;
  loading: boolean;
} {
  const violations = useLiveCollection(enabled ? "violations" : null);
  const impoundRecords = useLiveCollection(enabled ? "impoundRecords" : null);
  const payments = useLiveCollection(enabled ? "payments" : null);
  const releaseLog = useLiveCollection(enabled ? "releaseLog" : null);
  const operationSchedules = useLiveCollection(enabled ? "operationSchedules" : null);
  return useMemo(() => {
    const rows = { violations, impoundRecords, payments, releaseLog, operationSchedules };
    return { rows, loading: SOURCES.some((s) => rows[s] === undefined) };
  }, [violations, impoundRecords, payments, releaseLog, operationSchedules]);
}

/** Live field activity since `since`, newest first. */
export function useFieldActivity(since: Date): {
  events: ActivityEvent[];
  loading: boolean;
} {
  const { rows, loading } = useActivityRows();
  const sinceMs = since.getTime();
  const events = useMemo(
    () => buildActivity(rows).filter((e) => e.time.getTime() >= sinceMs),
    [rows, sinceMs]
  );
  return { events, loading };
}
