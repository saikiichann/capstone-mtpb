/* ------------------------------------------------------------------
   SUPERVISOR — Impounding Log (/supervisor/impounding)

   BAGONG IMPOUND PROCESS:
     - Hiwalay sa clamp. Walang "Subject to Impound".
     - Base sa UOVR (Blue Ticket).
     - Status: "Impounded" / "Released" lang.
     - Isang data source: impoundRecords.

   Supervisor = MONITORING + EDIT. Walang "Add Record" button (nasa
   Impounding Staff side iyon), pero may "Edit" button para sa mga
   record na "Impounded" pa lang. Ang "Released" ay hindi na
   ma-edit (naka-lock na).
   Styles: ./ImpoundingLog.css
------------------------------------------------------------------ */
import { useState, useEffect, useMemo } from "react";
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { encodedAt } from "../../lib/impoundOrder";
import { useWithDirectImpounds } from "../../lib/directImpounds";
import "./ImpoundingLog.css";
import SupervisorEditImpoundModal, {
  type ImpoundRecordData,
} from "./EditImpoundModal";


import overviewIcon from "../../assets/overview.png";
import sectorAnalyticsIcon from "../../assets/sectoranalytics.png";
import mapIcon from "../../assets/map.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
import historyIcon from "../../assets/history.png";
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

type LogStatus = "Impounded" | "Released";

type ImpoundLogRow = {
  id: string;
  recordId: string;
  uovrNo: string;
  reference: string | null;
  cin: string;
  plateNo: string;
  violation: string;
  location: string;
  officer: string;
  recordedAt: Timestamp | null;
  /** Order in the list: when the record was saved (lib/impoundOrder.ts). */
  sortKey: number;
  impoundFee: number;
  status: LogStatus;
  /** Enforcer-issued impound (violations), no impound record */
  fromViolation?: boolean;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;
const ALL_VIOLATIONS = "All Violations";

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
      { label: "Overview", icon: overviewIcon, path: "/supervisor" },
      {
        label: "Sector Analytics",
        icon: sectorAnalyticsIcon,
        path: "/supervisor/sector-analytics",
      },
      {
        label: "Geospatial Heatmap",
        icon: mapIcon,
        path: "/supervisor/heatmap",
      },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "Clamping Log", icon: clampingIcon, path: "/supervisor/clamping" },
      {
        label: "Impounding Log",
        icon: impoundingIcon,
        path: "/supervisor/impounding",
        active: true,
      },
      {
        label: "Vehicle History",
        icon: historyIcon,
        path: "/supervisor/vehicle-history",
      },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Requests",
        icon: releaseRequestIcon,
        path: "/supervisor/release-requests",
      },
      {
        label: "Release Queue",
        icon: queueIcon,
        path: "/supervisor/release-queue",
      },
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/supervisor/release-log",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Field Updates",
        icon: fieldUpdateIcon,
        path: "/supervisor/field-updates",
      },
      {
        label: "Operation Scheduler",
        icon: operationSchedulerIcon,
        path: "/supervisor/operation-scheduler",
      },
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


const formatCurrency = (n: number): string =>
  `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const normalizeStatus = (raw: unknown): LogStatus => {
  const v = String(raw ?? "").toLowerCase().trim();
  return v === "released" ? "Released" : "Impounded";
};

const getStatusClass = (status: LogStatus): string =>
  status === "Released" ? "status-released" : "status-impounded";

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function SupervisorImpoundingLog() {
  const [editing, setEditing] = useState<ImpoundRecordData | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "supervisor",
  });

  const [recordLogs, setLogs] = useState<ImpoundLogRow[]>([]);
  /** + impounds issued by the enforcer app (lib/directImpounds.ts) */
  const logs: ImpoundLogRow[] = useWithDirectImpounds(recordLogs);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [violationFilter, setViolationFilter] = useState(ALL_VIOLATIONS);
  const [currentPage, setCurrentPage] = useState(1);

  /* Load latest record, tapos open Edit modal */
  const openEdit = async (recordId: string) => {
    setOpeningId(recordId);
    setNotice(null);
    try {
      const snap = await getDoc(doc(db, "impoundRecords", recordId));
      if (!snap.exists()) {
        setNotice({ text: "This impound record no longer exists.", ok: false });
        return;
      }
      const data = snap.data();
      if (normalizeStatus(data.status) !== "Impounded") {
        setNotice({
          text: "Only records of impounded vehicles can be edited.",
          ok: false,
        });
        return;
      }
      setEditing({ id: snap.id, ...data } as ImpoundRecordData);
    } catch (err) {
      console.error("Failed to open impound record:", err);
      setNotice({ text: "Could not load the impound record.", ok: false });
    } finally {
      setOpeningId(null);
    }
  };

  /* Fetch current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "supervisor" });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "supervisor") as RoleSlug,
          });
        }
      } catch (err) {
        console.error("Failed to load current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /* Fetch impoundRecords */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "impoundRecords"),
      (snap) => {
        const rows: ImpoundLogRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              recordId: d.id,
              uovrNo: data.uovrNo ?? "—",
              reference:
                (data.referenceNumber as string) ??
                (data.paymentReference as string) ??
                null,
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              violation:
                data.initialViolation ??
                data.violationType ??
                data.violation ??
                "—",
              location: data.location ?? "—",
              officer:
                data.clampedBy ??
                data.towedBy ??
                data.impoundedBy ??
                "—",
              recordedAt: ((data.clampedAt ?? data.ticketDate ?? data.createdAt) as Timestamp) ?? null,
              sortKey: encodedAt(d),
              impoundFee: Number(data.impoundFee ?? 0),
              status: normalizeStatus(data.status),
            };
          })
          .sort((a, b) => b.sortKey - a.sortKey);

        setLogs(rows);
        setLoading(false);
      },
      (err) => {
        console.warn("impoundRecords fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Violation filter options */
  const violationOptions = useMemo(() => {
    const unique = new Set<string>();
    logs.forEach((row) => {
      if (row.violation && row.violation !== "—") unique.add(row.violation);
    });
    return [ALL_VIOLATIONS, ...Array.from(unique).sort()];
  }, [logs]);

  /* Search + filter */
  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return logs.filter((row) => {
      const matchesSearch =
        !q ||
        row.cin.toLowerCase().includes(q) ||
        row.plateNo.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q) ||
        row.violation.toLowerCase().includes(q) ||
        row.uovrNo.toLowerCase().includes(q);
      const matchesViolation =
        violationFilter === ALL_VIOLATIONS || row.violation === violationFilter;
      return matchesSearch && matchesViolation;
    });
  }, [logs, searchQuery, violationFilter]);

  /* Counts */
  const impoundedCount = useMemo(
    () => logs.filter((r) => r.status === "Impounded").length,
    [logs]
  );
  const releasedCount = useMemo(
    () => logs.filter((r) => r.status === "Released").length,
    [logs]
  );

  /* Pagination */
  const totalPages = Math.max(
    1,
    Math.ceil(filteredLogs.length / ITEMS_PER_PAGE)
  );
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedLogs = filteredLogs.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  // Back to page 1 when these change (during render, not in an effect)
  const pageResetKey = JSON.stringify([searchQuery, violationFilter]);
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setCurrentPage(1);
  }

  return (
    <div className="oic-page impound-log-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={NAV_GROUPS} role={<>{ROLE_LABELS[currentUser.role]}</>} />

        {/* MAIN */}
        <div className="main">
          <AppTopbar groups={NAV_GROUPS} />
          <header className="main-header">
            <div>
              <h1>Impounding Log</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

          </header>

          <main className="main-content impounding-body">
            {/* SEARCH + FILTER */}
            <div className="search-filter-row">
              <div className="search-bar-container">
                <Search size={18} className="search-bar-icon" />
                <input
                  type="text"
                  className="search-bar-input"
                  placeholder="Search UOVR, CIN, Plate No..."
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
            <div className="card impounding-card">
              <div className="log-header">
                <p className="card-eyebrow">Sector 3</p>
                <div className="log-header-meta">
                  Impounded: <strong>{impoundedCount}</strong> · Released:{" "}
                  <strong>{releasedCount}</strong>
                </div>
              </div>
              <h2 className="card-title" style={{ marginBottom: 16 }}>
                Impounding Log
              </h2>

              {notice && (
                <div className={`sup-edit-notice${notice.ok ? "" : " is-error"}`}>
                  {notice.text}
                </div>
              )}

              {loading ? (
                <div className="table-loading">
                  <p>Loading impounding log...</p>
                </div>
              ) : paginatedLogs.length === 0 ? (
                <div className="impounding-empty">
                  {logs.length === 0
                    ? "No impounding records found."
                    : "No records match your search or filter."}
                </div>
              ) : (
                <div className="impounding-table-wrap" tabIndex={0} role="region" aria-label="Impounding log table" data-scroll-region>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>UOVR No.</th>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Violation</th>
                        <th>Location</th>
                        <th>Impounded by</th>
                        <th>Time</th>
                        <th>Fee</th>
                        <th>Status</th>
                        <th className="sup-cell-action">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedLogs.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-reference">{row.uovrNo}</td>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-violation">{row.violation}</td>
                          <td className="cell-location">{row.location}</td>
                          <td className="cell-officer">{row.officer}</td>
                          <td className="cell-time">
                            {formatDateTime(row.recordedAt)}
                          </td>
                          <td className="cell-fee">
                            {formatCurrency(row.impoundFee)}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${getStatusClass(
                                row.status
                              )}`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="sup-cell-action">
                            {row.status === "Impounded" && !row.fromViolation ? (
                              <button
                                type="button"
                                className="sup-btn-edit"
                                onClick={() => openEdit(row.recordId)}
                                disabled={openingId === row.recordId}
                                title="Edit impound record"
                              >
                                <Pencil size={13} />
                                {openingId === row.recordId
                                  ? "Opening..."
                                  : "Edit"}
                              </button>
                            ) : (
                              <span className="sup-action-none">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PAGINATION */}
              {!loading && paginatedLogs.length > 0 && (
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
                    <span className="pagination-sep">
                      of {totalPages} pages
                    </span>
                  </div>

                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
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

      {/* EDIT MODAL */}
      {editing && (
        <SupervisorEditImpoundModal
          record={editing}
          currentUserName={currentUser.name}
          onClose={() => setEditing(null)}
          onSaved={() =>
            setNotice({
              text: `Impound record ${editing.cin ?? ""} updated.`,
              ok: true,
            })
          }
        />
      )}
    </div>
  );
}