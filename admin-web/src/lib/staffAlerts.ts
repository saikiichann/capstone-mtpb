/* ------------------------------------------------------------------
   STAFF ALERTS — the notification bell (top bar) and the red badges
   in the sidebar.

   Built from the same live events as Field Updates (lib/fieldActivity),
   so nothing new is written to Firestore and the enforcer app doesn't
   need an update:
     clamp      a vehicle was clamped
     impound    a vehicle was impounded
     operation  an operation was scheduled / started / completed / cancelled
     payment    a payment is waiting for verification

   Each role gets the kinds that concern it (FEEDS). A badge shows how
   many came in since the person last opened that page; Payment
   Verification shows how many are still waiting. "Last opened" and
   "last read" are kept per account in this browser (localStorage).
------------------------------------------------------------------ */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DocumentData } from "firebase/firestore";
import { auth } from "../firebase";
import {
  buildActivity,
  useActivityRows,
  type ActivityEvent,
  type ActivityKind,
} from "./fieldActivity";
import { derivePaymentLocation, isInStaffScope } from "./paymentLocation";
import { useStaffProfile } from "./useStaffProfile";

/** Which kinds each role is told about, and the page each one opens. */
export const FEEDS: Record<string, Partial<Record<ActivityKind, string>>> = {
  oic: {
    clamp: "/dashboard/clamping",
    impound: "/dashboard/impounding",
    operation: "/dashboard/operation-scheduler",
    payment: "/dashboard/verification",
  },
  supervisor: {
    clamp: "/supervisor/clamping",
    impound: "/supervisor/impounding",
    operation: "/supervisor/operation-scheduler",
  },
  "record-officer": {
    clamp: "/record-officer/clamping",
    impound: "/record-officer/impounding",
  },
  "impounding-staff": {
    impound: "/impounding-staff/log",
  },
  finance: {
    payment: "/finance/verification",
  },
};

/** The bell lists this far back. */
const BELL_DAYS = 7;
const BELL_MAX = 30;

/** Same rule as the Payment Verification pages. */
export const isPendingVerification = (d: DocumentData): boolean => {
  const status = String(d.verificationStatus ?? d.status ?? "").toLowerCase();
  return ![
    "verified",
    "succeeded",
    "approved",
    "rejected",
    "failed",
    "declined",
  ].includes(status);
};

/* ---------------- "last opened" per page, per account ---------------- */
type Seen = Record<string, number>;
const BELL = "bell";
const storageKey = (uid: string) => `mtpb:alertsSeen:${uid}`;

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

let seenUid: string | null = null;
let seen: Seen = {};
const seenListeners = new Set<() => void>();

function loadSeen(uid: string | null) {
  if (uid === seenUid) return;
  seenUid = uid;
  seen = {};
  if (!uid) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(uid)) ?? "{}");
    if (parsed && typeof parsed === "object") seen = parsed as Seen;
  } catch {
    // storage blocked: start from today
  }
}

function markSeenAt(key: string, at = Date.now()) {
  if (!seenUid || (seen[key] ?? 0) >= at) return;
  seen = { ...seen, [key]: at };
  try {
    localStorage.setItem(storageKey(seenUid), JSON.stringify(seen));
  } catch {
    // storage blocked: remembered until the page is reloaded
  }
  seenListeners.forEach((l) => l());
}

const subscribeSeen = (l: () => void) => {
  seenListeners.add(l);
  return () => seenListeners.delete(l);
};
const readSeen = () => seen;

/* ---------------- the hook ---------------- */
export type StaffAlerts = {
  /** Whether this role has a bell at all. */
  enabled: boolean;
  /** Sidebar badge count by page path. */
  badges: Record<string, number>;
  /** Newest first, for the bell. */
  events: ActivityEvent[];
  /** The page an event opens. */
  pathFor: (e: ActivityEvent) => string | undefined;
  unread: number;
  /** When the bell was last read (ms). */
  bellReadAt: number;
  markBellRead: () => void;
  /** The person is on this page: what's there now counts as seen. */
  markPageSeen: (path: string) => void;
};

export function useStaffAlerts(): StaffAlerts {
  const { profile } = useStaffProfile();
  const role = profile?.role ?? "";
  const feed = FEEDS[role];
  const enabled = !!feed;
  const uid = auth.currentUser?.uid ?? null;
  loadSeen(uid);
  const seenNow = useSyncExternalStore(subscribeSeen, readSeen, readSeen);
  const { rows } = useActivityRows(enabled);

  // A clock for "last 7 days" / "today", moved on every minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const today = startOfDay(now);

  // Finance staff with an assigned location see only their own payments.
  const staffLocation = role === "finance" ? profile?.assignedLocation ?? null : null;

  const events = useMemo(() => {
    if (!feed) return [];
    const since = now - BELL_DAYS * 86_400_000;
    return buildActivity(rows).filter((e) => {
      if (!feed[e.kind] || e.time.getTime() < since) return false;
      if (e.kind !== "payment") return true;
      return (
        isPendingVerification(e.raw) &&
        isInStaffScope(
          staffLocation,
          derivePaymentLocation(e.raw.method, e.raw.paymentLocation ?? e.raw.location)
        )
      );
    });
  }, [rows, feed, staffLocation, now]);

  const badges = useMemo(() => {
    const out: Record<string, number> = {};
    if (!feed) return out;
    (Object.entries(feed) as [ActivityKind, string][]).forEach(([kind, path]) => {
      if (kind === "payment") {
        // Still waiting, however old.
        out[path] = (rows.payments ?? []).filter(
          ({ data }) =>
            isPendingVerification(data) &&
            isInStaffScope(
              staffLocation,
              derivePaymentLocation(data.method, data.paymentLocation ?? data.location)
            )
        ).length;
        return;
      }
      const after = seenNow[path] ?? today;
      out[path] = events.filter((e) => e.kind === kind && e.time.getTime() > after).length;
    });
    return out;
  }, [feed, rows.payments, events, seenNow, staffLocation, today]);

  const bellReadAt = seenNow[BELL] ?? today;
  const unread = events.filter((e) => e.time.getTime() > bellReadAt).length;

  const pathFor = useCallback((e: ActivityEvent) => feed?.[e.kind], [feed]);
  const markBellRead = useCallback(() => markSeenAt(BELL), []);
  const markPageSeen = useCallback((path: string) => markSeenAt(path), []);

  return {
    enabled,
    badges,
    events: events.slice(0, BELL_MAX),
    pathFor,
    unread,
    bellReadAt,
    markBellRead,
    markPageSeen,
  };
}
