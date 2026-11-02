/* ------------------------------------------------------------------
   RECORD OFFICER — Clamping Log (/record-officer/clamping)

   Monitoring lang. Same content as OIC/Supervisor Clamping Log, pero:
     - Sidebar para sa Record Officer (All Violations, Clamping Log,
       Impounding Log, Release Log, Reports)
     - Walang Payment/Finance group
   CLAMP is separate from IMPOUND. ₱900 within 24 hours, ₱2,000 after
   (fixed, hindi na tumataas). NANANATILING NAKA-CLAMP.
   Styles: ./ClampingLog.css
------------------------------------------------------------------ */
import { useState, useEffect, useMemo } from "react";
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ClampingLog.css";
import {
  CLAMP_OVERDUE_FEE,
  amountDueFor,
  graceHoursLeft,
  isClampOverdue,
} from "../../lib/clampFee";

import overviewIcon from "../../assets/overview.png";
import allViolationsIcon from "../../assets/allviolations.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingLogIcon from "../../assets/impounding.png";
import releaseLogIcon from "../../assets/releaselog.png";
import allReportsIcon from "../../assets/reports.png";
import exportCenterIcon from "../../assets/export.png";
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

type LogStatus = "Clamped" | "Removed";

type ClampLogRow = {
  id: string;
  reference: string | null;
  cin: string;
  plateNo: string;
  violation: string;
  location: string;
  officer: string;
  recordedAt: Timestamp | null;
  status: LogStatus;
  amountDue: number;
  overdue: boolean;
  paid: boolean;
  graceLeft: number;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;
const ALL_VIOLATIONS = "All Violations";

const MASTER_VIOLATIONS = [
  "Illegal Parking",
  "No Parking Zone",
  "Obstruction",
  "Sidewalk Parking",
  "Street Corner Parking",
  "Left Side Parking",
  "Right Side Parking",
  "Top of the Bridge Parking",
  "Loading & Unloading Area",
  "Blocking Driveway",
  "Blocking PWD Lane",
  "Blocking Fire Hydrant",
  "Complaint Area",
  "Blocking Pedestrian Lane",
  "Blocking Fire Truck Lane",
  "Double Parking",
];


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
      {
        label: "All Violations",
        icon: allViolationsIcon,
        path: "/record-officer/violations",
      },
      {
        label: "Clamping Log",
        icon: clampingIcon,
        path: "/record-officer/clamping",
        active: true,
      },
      {
        label: "Impounding Log",
        icon: impoundingLogIcon,
        path: "/record-officer/impounding",
      },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/record-officer/release-log",
      },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "All Reports", icon: allReportsIcon, path: "/record-officer/reports" },
      { label: "Export Center", icon: exportCenterIcon, path: "/record-officer/export" },
    ],
  },
];

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

const normalizeViolationType = (raw: unknown): string => {
  if (typeof raw !== "string") return "—";
  const trimmed = raw.trim();
  if (!trimmed) return "—";

  const knownMap: Record<string, string> = {
    "illegal parking": "Illegal Parking",
    "no parking zone": "No Parking Zone",
    obstruction: "Obstruction",
    "sidewalk parking": "Sidewalk Parking",
    "street corner parking": "Street Corner Parking",
    "left side parking": "Left Side Parking",
    "right side parking": "Right Side Parking",
    "top of the bridge parking": "Top of the Bridge Parking",
    "loading & unloading area": "Loading & Unloading Area",
    "blocking driveway": "Blocking Driveway",
    "blocking pwd lane": "Blocking PWD Lane",
    "blocking fire hydrant": "Blocking Fire Hydrant",
    "complaint area": "Complaint Area",
    "blocking pedestrian lane": "Blocking Pedestrian Lane",
    "blocking fire truck lane": "Blocking Fire Truck Lane",
    "double parking": "Double Parking",
  };

  const key = trimmed.toLowerCase();
  if (key in knownMap) return knownMap[key];

  return trimmed
    .split(" ")
    .map((word) => {
      if (!word) return word;
      if (word === word.toUpperCase() && word.length <= 4) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

const deriveLogStatus = (releaseStatus: unknown): LogStatus =>
  releaseStatus === "Released" ? "Removed" : "Clamped";

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function RecordOfficerClampingLog() {

  const [, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [rows, setRows] = useState<ClampLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [violationFilter, setViolationFilter] = useState(ALL_VIOLATIONS);
  const [currentPage, setCurrentPage] = useState(1);

  /* Current user */
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
        }
      } catch (err) {
        console.error("Failed to load current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /* Fetch clamping records */
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("enforcementType", "==", "clamped")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: ClampLogRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            const recordedAt = (data.recordedAt as Timestamp) ?? null;
            const releaseStatus = data.releaseStatus;

            return {
              id: d.id,
              reference:
                (data.referenceNumber as string) ??
                (data.paymentReference as string) ??
                null,
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              violation: normalizeViolationType(data.violationType),
              location: data.location ?? "—",
              officer: data.officer ?? "—",
              recordedAt,
              status: deriveLogStatus(releaseStatus),
              amountDue: amountDueFor(data),
              overdue: isClampOverdue(data),
              paid: ["verified", "pending verification"].includes(
                String(data.paymentStatus ?? "").toLowerCase()
              ),
              graceLeft: graceHoursLeft(data),
            };
          })
          .sort((a, b) => millis(b.recordedAt) - millis(a.recordedAt));

        setRows(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Clamping log fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const violationOptions = useMemo(() => {
    const unique = new Set<string>(MASTER_VIOLATIONS);
    rows.forEach((row) => {
      if (row.violation && row.violation !== "—") unique.add(row.violation);
    });
    return [ALL_VIOLATIONS, ...Array.from(unique).sort()];
  }, [rows]);

  /* Search + filter */
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((row) => {
      const matchesSearch =
        !q ||
        row.cin.toLowerCase().includes(q) ||
        row.plateNo.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q) ||
        row.violation.toLowerCase().includes(q);
      const matchesViolation =
        violationFilter === ALL_VIOLATIONS || row.violation === violationFilter;
      return matchesSearch && matchesViolation;
    });
  }, [rows, searchQuery, violationFilter]);

  const activeClamps = useMemo(
    () => rows.filter((r) => r.status === "Clamped").length,
    [rows]
  );

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Back to page 1 when these change (during render, not in an effect)
  const pageResetKey = JSON.stringify([searchQuery, violationFilter]);
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setCurrentPage(1);
  }

  return (
    <div className="record-page clamping-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={NAV_GROUPS} role={<>Record Officer</>} />

        {/* MAIN */}
        <div className="main">
          <AppTopbar groups={NAV_GROUPS} />
          <header className="main-header">
            <div>
              <h1>Clamping Log</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

          </header>

          <main className="main-content clamping-body">
            {/* SEARCH + FILTER */}
            <div className="clamping-toolbar">
              <div className="search-bar-container">
                <Search size={18} className="search-bar-icon" />
                <input
                  type="text"
                  className="search-bar-input"
                  placeholder="Search CIN, Plate No..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-select-wrap">
                <select
                  className="filter-select"
                  value={violationFilter}
                  onChange={(e) => setViolationFilter(e.target.value)}
                  aria-label="Filter by violation"
                >
                  {violationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} className="filter-select-icon" />
              </div>
            </div>

            {/* TABLE */}
            <div className="card clamping-card">
              <div className="log-header">
                <div>
                  <p className="card-eyebrow">Sector 3</p>
                  <h2 className="card-title">Clamping Log</h2>
                </div>
                <div className="log-header-meta">
                  Active clamps: <strong>{activeClamps}</strong> total
                </div>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading clamping log...</p>
                </div>
              ) : paginatedRows.length === 0 ? (
                <div className="table-empty">
                  <p>
                    {rows.length === 0
                      ? "No clamping records found."
                      : "No records match your search or filter."}
                  </p>
                </div>
              ) : (
                <div className="clamping-table-wrap" tabIndex={0} role="region" aria-label="Clamping log table" data-scroll-region>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Violation</th>
                        <th>Location</th>
                        <th>Clamped by</th>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-reference">{row.reference ?? "—"}</td>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-violation">{row.violation}</td>
                          <td className="cell-location">{row.location}</td>
                          <td className="cell-officer">{row.officer}</td>
                          <td className="cell-time">{formatDateTime(row.recordedAt)}</td>
                          <td>
                            <span
                              className={`status-pill ${
                                row.status === "Clamped"
                                  ? "status-clamped"
                                  : "status-removed"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td>
                            {/* ₱900 within 24 hours, ₱2,000 after — stays clamped (lib/clampFee.ts) */}
                            {row.status !== "Removed" && row.paid && (
                              <span className="badge-paid" title="Payment recorded">
                                Paid · ₱{row.amountDue.toLocaleString()}
                              </span>
                            )}
                            {row.status !== "Removed" && !row.paid && row.overdue && (
                              <span
                                className="badge-overdue"
                                title="Past the 24-hour grace period: the fee is now a fixed ₱2,000 (replaces the fine). The vehicle stays clamped."
                              >
                                Overdue · ₱{CLAMP_OVERDUE_FEE.toLocaleString()}
                              </span>
                            )}
                            {row.status !== "Removed" && !row.paid && !row.overdue && (
                              <span className="fee-pending" title="Within the 24-hour grace period">
                                ₱{row.amountDue.toLocaleString()} · {Math.max(1, Math.ceil(row.graceLeft))}h left
                              </span>
                            )}

                            {row.status === "Removed" && (
                              <span className="action-placeholder">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PAGINATION */}
              {!loading && paginatedRows.length > 0 && (
                <div className="pagination">
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>

                  <div className="pagination-info">
                    <span className="pagination-page">{safePage}</span>
                    <span className="pagination-sep">of {totalPages} pages</span>
                  </div>

                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

    </div>
  );
}