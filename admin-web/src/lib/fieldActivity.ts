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
   feed only reads — it never writes.
------------------------------------------------------------------ */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";

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
};

type Source = "violations" | "impoundRecords" | "payments" | "releaseLog" | "operationSchedules";
const SOURCES: Source[] = [
  "violations",
  "impoundRecords",
  "payments",
  "releaseLog",
  "operationSchedules",
];

type Rows = { id: string; data: DocumentData }[];

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
  if (!isClampViolation(d)) return [];
  const time = toDate(d.recordedAt ?? d.createdAt);
  if (!time) return [];
  const officer = str(d.officer ?? d.officerName ?? d.enforcerName) || "Enforcer";
  return [
    {
      id: `v-${id}`,
      kind: "clamp",
      time,
      title: `${officer} clamped ${str(d.plateNo) || "a vehicle"}`,
      detail: join(d.cin, d.violationType, d.location, d.barangay),
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
    if (time) out.push({ id: `o-${id}-${key}`, kind: "operation", time, title, detail });
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

/* ---------------- hook ---------------- */
/** Live field activity since `since`, newest first. */
export function useFieldActivity(since: Date): {
  events: ActivityEvent[];
  loading: boolean;
} {
  const [rows, setRows] = useState<Partial<Record<Source, Rows>>>({});

  useEffect(() => {
    const unsubs = SOURCES.map((source) =>
      onSnapshot(
        collection(db, source),
        (snap) =>
          setRows((prev) => ({
            ...prev,
            [source]: snap.docs.map((d) => ({ id: d.id, data: d.data() })),
          })),
        (err) => {
          console.warn(`Field activity: ${source} fetch failed:`, err.code);
          setRows((prev) => ({ ...prev, [source]: [] }));
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  const sinceMs = since.getTime();
  const events = useMemo(() => {
    const all: ActivityEvent[] = [];
    SOURCES.forEach((source) =>
      (rows[source] ?? []).forEach(({ id, data }) =>
        all.push(...BUILDERS[source](id, data))
      )
    );
    return all
      .filter((e) => e.time.getTime() >= sinceMs)
      .sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [rows, sinceMs]);

  const loading = SOURCES.some((s) => rows[s] === undefined);
  return { events, loading };
}
