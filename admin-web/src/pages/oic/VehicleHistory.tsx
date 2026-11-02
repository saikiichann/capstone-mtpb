import { useState, useEffect, useMemo, type FormEvent } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
  type DocumentData
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./VehicleHistory.css";


import overviewIcon from "../../assets/overview.png";
import sectorAnalyticsIcon from "../../assets/sectoranalytics.png";
import mapIcon from "../../assets/map.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
import historyIcon from "../../assets/history.png";
import pendingPaymentsIcon from "../../assets/pendingpayments.png";
import paymentVerificationIcon from "../../assets/paymentverification.png";
import transactionIcon from "../../assets/transaction.png";
import revenueIcon from "../../assets/revenue.png";
import releaseRequestIcon from "../../assets/releaserequest.png";
import queueIcon from "../../assets/queue.png";
import releaseLogIcon from "../../assets/releaselog.png";
import fieldUpdateIcon from "../../assets/fieldupdate.png";
import operationSchedulerIcon from "../../assets/scheduler.png";
import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */
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

type TimelineEvent = { title: string; detail: string };

type ViolationGroup = {
  cin: string;
  recordedAt: Timestamp | null;
  location: string | null;
  barangay: string | null;
  events: TimelineEvent[];
};

/** One vehicle (all spellings of the same plate), for the list. */
type VehicleRow = {
  key: string;
  plate: string;
  count: number;
  unpaid: number;
  lastType: string;
  lastAt: Timestamp | null;
  location: string | null;
  barangay: string | null;
  groups: ViolationGroup[];
};

/** Rows shown before "Show more". */
const PAGE_STEP = 15;

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ROLE_LABELS: Record<RoleSlug, string> = {
  oic: "Officer in Charge",
  "it-admin": "IT Admin",
  supervisor: "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  finance: "Finance",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/dashboard" },
      {
        label: "Sector Analytics",
        icon: sectorAnalyticsIcon,
        path: "/dashboard/sector-analytics",
      },
      {
        label: "Geospatial Heatmap",
        icon: mapIcon,
        path: "/dashboard/heatmap",
      },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "Clamping Log", icon: clampingIcon, path: "/dashboard/clamping" },
      {
        label: "Impounding Log",
        icon: impoundingIcon,
        path: "/dashboard/impounding",
      },
      {
        label: "Vehicle History",
        icon: historyIcon,
        path: "/dashboard/vehicle-history",
        active: true,
      },
    ],
  },
  {
    label: "Payment/Finance",
    items: [
      {
        label: "Pending Payments",
        icon: pendingPaymentsIcon,
        path: "/dashboard/pending-payments",
      },
      {
        label: "Payment Verification",
        icon: paymentVerificationIcon,
        path: "/dashboard/verification",
      },
      {
        label: "Transaction History",
        icon: transactionIcon,
        path: "/dashboard/transactions",
      },
      { label: "Revenue Reports", icon: revenueIcon, path: "/dashboard/revenue" },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Requests",
        icon: releaseRequestIcon,
        path: "/dashboard/release-requests",
      },
      {
        label: "Release Queue",
        icon: queueIcon,
        path: "/dashboard/release-queue",
      },
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/dashboard/release-log",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Field Updates",
        icon: fieldUpdateIcon,
        path: "/dashboard/field-updates",
      },
      {
        label: "Operation Scheduler",
        icon: operationSchedulerIcon,
        path: "/dashboard/operation-scheduler",
      },
    ],
  },
];

/** Plain-language label for each releaseStatus value used elsewhere in the
 *  system (see lib/release.ts). Falls back to the raw value for anything
 *  unrecognized, so a future status never renders as blank. */
const RELEASE_STATUS_LABELS: Record<string, string> = {
  Pending: "Awaiting payment",
  "Awaiting OIC Approval": "Awaiting OIC approval",
  "Approved by OIC": "Approved — awaiting release",
  "Rejected by OIC": "Rejected by OIC",
  Released: "Released",
};

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
const formatDateTime = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const millis = (ts: Timestamp | null): number => {
  try {
    return ts ? ts.toMillis() : 0;
  } catch {
    return 0;
  }
};

/** "₱1,000" — whole pesos, no decimals. This is a narrative timeline
 *  sentence, not a receipt, so it stays simpler than the 2-decimal
 *  currency formatting used on the payment/finance pages. */
const formatPeso = (amount: number): string =>
  `₱${Math.round(amount).toLocaleString("en-US")}`;

/**
 * "abg 1234" / " ABG   1234 " → "ABG 1234". Matches the same trim+uppercase
 * that issueViolationForClamp already applies when a violation is first
 * written, so a search only succeeds if it matches that exact spacing —
 * Firestore has no partial/fuzzy match, so this is an exact-plate lookup,
 * not a live filter.
 */
const normalizePlate = (value: string): string =>
  value.trim().toUpperCase().replace(/\s+/g, " ");

/** "abc 1234", "ABC-1234", "ABC1234" → "ABC1234": one key per vehicle,
 *  however the plate was typed in the enforcer app or Add Impound. */
const plateKey = (value: unknown): string =>
  String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Builds this violation's narrative timeline from its real fields, in the
 * same four-stage shape the design uses — but reflecting actual payment
 * and release state instead of frozen sample text.
 */
const buildEvents = (cin: string, data: DocumentData): TimelineEvent[] => {
  const events: TimelineEvent[] = [];
  const isImpound = String(data.enforcementType ?? "") === "impounded";
  const fineAmount = Number(data.fineAmount ?? 0) || Number(data.impoundFee ?? 0);

  events.push({
    title: `Violation recorded — ${data.violationType ?? "Violation"}`,
    detail: `${formatDateTime(data.recordedAt ?? null)} · ${cin}`,
  });

  events.push({
    title: `${isImpound ? "Impound fee" : "Fine computed"} — ${formatPeso(fineAmount)}`,
    detail: isImpound
      ? "Based on weight class and towing distance"
      : "Automated, based on vehicle classification",
  });

  const paymentStatus = data.paymentStatus ?? "Unpaid";
  const paidAmount = Number(data.totalPaid ?? fineAmount);
  const viaMethod = data.paymentMethod ? ` · Paid via ${data.paymentMethod}` : "";

  if (paymentStatus === "Verified") {
    events.push({
      title: "Payment verified",
      detail: `${formatPeso(paidAmount)}${viaMethod}`,
    });
  } else if (paymentStatus === "Pending Verification") {
    events.push({
      title: "Payment pending verification",
      detail: `${formatPeso(paidAmount)}${viaMethod}`,
    });
  } else if (paymentStatus === "Rejected") {
    events.push({
      title: "Payment rejected",
      detail: data.rejectionReason
        ? String(data.rejectionReason)
        : "Verification failed",
    });
  } else {
    events.push({
      title: "Payment not yet made",
      detail: `${formatPeso(fineAmount)} due`,
    });
  }

  const releaseStatus = String(data.releaseStatus ?? "Pending");
  events.push({
    title: "Status",
    detail: RELEASE_STATUS_LABELS[releaseStatus] ?? releaseStatus,
  });

  return events;
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function VehicleHistory() {

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });

  const [searchInput, setSearchInput] = useState("");
  /** Plate key of the vehicle being viewed, or null for the list. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(PAGE_STEP);

  /* Current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "oic" });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "oic") as RoleSlug,
          });
        }
      } catch (err) {
        console.error("Failed to load current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /** Supervisors see the same pages as the OIC, minus Payment/Finance. */
  const navGroups = useMemo(
    () =>
      NAV_GROUPS.filter(
        (group) =>
          !(currentUser.role === "supervisor" && group.label === "Payment/Finance")
      ),
    [currentUser.role]
  );

  /**
   * Every violation, grouped by vehicle. Live, so a new clamp or impound
   * shows up without reloading. Plates are matched by letters and digits
   * only, so "abc 1234", "ABC-1234" and "ABC1234" are the same vehicle.
   */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "violations"),
      (snap) => {
        const byKey = new Map<string, { rows: DocumentData[]; ids: string[] }>();
        snap.docs.forEach((d) => {
          const data = d.data();
          const key = plateKey(data.plateNo);
          if (!key) return;
          const entry = byKey.get(key) ?? { rows: [], ids: [] };
          entry.rows.push(data);
          entry.ids.push(d.id);
          byKey.set(key, entry);
        });

        const built: VehicleRow[] = Array.from(byKey.entries()).map(([key, entry]) => {
          const groups: ViolationGroup[] = entry.rows
            .map((data, i) => {
              const cin = data.cin ?? entry.ids[i];
              return {
                cin,
                recordedAt: (data.recordedAt as Timestamp) ?? null,
                location: data.location ?? null,
                barangay: data.barangay ?? null,
                events: buildEvents(cin, data),
              };
            })
            .sort((a, b) => millis(b.recordedAt) - millis(a.recordedAt));
          const newest = entry.rows
            .slice()
            .sort((a, b) => millis(b.recordedAt ?? null) - millis(a.recordedAt ?? null))[0];
          return {
            key,
            plate: normalizePlate(String(newest?.plateNo ?? key)),
            count: entry.rows.length,
            unpaid: entry.rows.filter((r) => (r.paymentStatus ?? "Unpaid") === "Unpaid").length,
            lastType: String(newest?.violationType ?? "—"),
            lastAt: (newest?.recordedAt as Timestamp) ?? null,
            location: newest?.location ?? null,
            barangay: newest?.barangay ?? null,
            groups,
          };
        });
        built.sort((a, b) => millis(b.lastAt) - millis(a.lastAt));
        setVehicles(built);
        setLoading(false);
      },
      (err) => {
        console.error("Vehicle history fetch failed:", err);
        setVehicles([]);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /** Typing filters the list; part of a plate is enough ("1234", "ABC"). */
  const matches = useMemo(() => {
    const q = plateKey(searchInput);
    return q ? vehicles.filter((v) => v.key.includes(q)) : vehicles;
  }, [vehicles, searchInput]);

  const selected = useMemo(
    () => (selectedKey ? vehicles.find((v) => v.key === selectedKey) ?? null : null),
    [vehicles, selectedKey]
  );
  const groups = selected?.groups ?? [];
  const queriedPlate = selected?.plate ?? null;

  /** Enter: open the exact plate, or the only match. */
  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = plateKey(searchInput);
    if (!q) return;
    const exact = vehicles.find((v) => v.key === q);
    const pick = exact ?? (matches.length === 1 ? matches[0] : null);
    if (pick) setSelectedKey(pick.key);
  };

  const latestLocationLabel = useMemo(() => {
    if (!selected) return null;
    if (selected.barangay) return `${selected.barangay}, Sector 3`;
    return selected.location;
  }, [selected]);

  return (
    <div className="oic-page vehicle-history-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={navGroups} role={<>{ROLE_LABELS[currentUser.role]}</>} />

        {/* MAIN */}
        <div className="main">
          <AppTopbar groups={navGroups} />
          <header className="main-header">
            <div>
              <h1>Vehicle History</h1>
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
            {/* LOOKUP CARD */}
            <div className="card">
              <div className="vehicle-lookup">
                <div>
                  <p className="card-eyebrow">Lookup</p>
                  <h2 className="card-title">Vehicle History</h2>
                  <p className="vehicle-lookup-hint">
                    {queriedPlate ? (
                      <>
                        Showing history for {queriedPlate}
                        {latestLocationLabel && (
                          <>
                            <br />
                            {latestLocationLabel}
                          </>
                        )}
                      </>
                    ) : (
                      "Type part of a plate number, or pick a vehicle below"
                    )}
                  </p>
                </div>

                <form onSubmit={handleSearch} className="vehicle-search" role="search">
                  <Search size={16} className="vehicle-search-icon" />
                  <input
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      setSelectedKey(null);
                      setShown(PAGE_STEP);
                    }}
                    placeholder="Search Plate Number"
                    aria-label="Search plate number"
                    className="vehicle-search-input"
                  />
                </form>
              </div>
            </div>

            {selected ? (
              /* TIMELINE OF ONE VEHICLE */
              <div className="card">
                <div className="vehicle-timeline-head">
                  <div>
                    <p className="card-eyebrow">Timeline</p>
                    <h2 className="card-title">
                      Enforcement history — {queriedPlate}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="vehicle-back-btn"
                    onClick={() => setSelectedKey(null)}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    All vehicles
                  </button>
                </div>

                <div className="vehicle-timeline-groups">
                  {groups.map((group) => (
                    <div key={group.cin} className="vehicle-timeline-group">
                      {groups.length > 1 && (
                        <p className="vehicle-timeline-group-label">
                          <span className="cin-pill">{group.cin}</span>
                        </p>
                      )}
                      <div className="vehicle-timeline">
                        {group.events.map((ev, i) => (
                          <div key={i} className="vehicle-timeline-item">
                            <span className="vehicle-timeline-dot" />
                            <div>
                              <div className="vehicle-timeline-title">
                                {ev.title}
                              </div>
                              <div className="vehicle-timeline-detail">
                                {ev.detail}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* ALL VEHICLES */
              <div className="card">
                <div className="vehicle-list-head">
                  <div>
                    <p className="card-eyebrow">Sector 3 · Most recent first</p>
                    <h2 className="card-title">All vehicles</h2>
                  </div>
                  {!loading && (
                    <p className="vehicle-list-count">
                      {searchInput.trim()
                        ? `${matches.length} of ${vehicles.length} vehicles`
                        : `${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}`}
                    </p>
                  )}
                </div>

                {loading ? (
                  <div className="vehicle-empty">
                    <p className="vehicle-empty-text">Loading vehicles...</p>
                  </div>
                ) : matches.length === 0 ? (
                  <div className="vehicle-empty">
                    <p className="vehicle-empty-text">
                      {vehicles.length === 0
                        ? "No violations have been recorded yet."
                        : `No plate matches "${searchInput.trim()}".`}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="vehicle-table-wrap">
                      <table className="vehicle-table">
                        <thead>
                          <tr>
                            <th>Plate No.</th>
                            <th>Violations</th>
                            <th>Unpaid</th>
                            <th>Latest violation</th>
                            <th>Last recorded</th>
                            <th aria-label="Actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {matches.slice(0, shown).map((v) => (
                            <tr key={v.key}>
                              <td className="vehicle-plate">{v.plate}</td>
                              <td>{v.count}</td>
                              <td>
                                {v.unpaid > 0 ? (
                                  <span className="vehicle-unpaid">{v.unpaid} unpaid</span>
                                ) : (
                                  <span className="vehicle-clear">None</span>
                                )}
                              </td>
                              <td>{v.lastType}</td>
                              <td>{formatDateTime(v.lastAt)}</td>
                              <td className="vehicle-action">
                                <button
                                  type="button"
                                  className="vehicle-view-btn"
                                  onClick={() => setSelectedKey(v.key)}
                                  aria-label={`View history of ${v.plate}`}
                                >
                                  View history
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {matches.length > shown && (
                      <button
                        type="button"
                        className="vehicle-more-btn"
                        onClick={() => setShown((n) => n + PAGE_STEP)}
                      >
                        Show more ({matches.length - shown} left)
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
