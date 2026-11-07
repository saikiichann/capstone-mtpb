/* ------------------------------------------------------------------
   RECORD OFFICER — Impounding Log (/record-officer/impounding)

   BAGONG IMPOUND PROCESS:
     - Hiwalay sa clamp. Walang "Subject to Impound".
     - Base sa UOVR (Blue Ticket).
     - Status: "Impounded" / "Released" lang.
     - Isang data source: impoundRecords.

   Record Officer = MONITORING VIEW lang. Walang "Add Record" o "Edit"
   buttons. "View Record" lang para sa detail (read-only).
   Styles: ./ImpoundingLog.css
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
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { encodedAt } from "../../lib/impoundOrder";
import { useWithDirectImpounds, violationAsImpoundRecord } from "../../lib/directImpounds";
import "./ImpoundingLog.css";


import overviewIcon from "../../assets/overview.png";
import allViolationsIcon from "../../assets/allviolations.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
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
  "oic": "Officer in Charge",
  "it-admin": "IT Admin",
  "supervisor": "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  "finance": "Finance Staff",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

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
      },
      {
        label: "Impounding Log",
        icon: impoundingIcon,
        path: "/record-officer/impounding",
        active: true,
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
export default function RecordOfficerImpoundingLog() {
  const [viewingId, setViewingId] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [recordLogs, setLogs] = useState<ImpoundLogRow[]>([]);
  /** + impounds issued by the enforcer app (lib/directImpounds.ts) */
  const logs: ImpoundLogRow[] = useWithDirectImpounds(recordLogs);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [violationFilter, setViolationFilter] = useState(ALL_VIOLATIONS);
  const [currentPage, setCurrentPage] = useState(1);

  /* Fetch current user */
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
    <div className="record-page impound-log-page">
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
                        <th>Action</th>
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
                          <td>
                            <button
                              type="button"
                              className="btn-view-record"
                              onClick={() => setViewingId(row.recordId)}
                            >
                              View Record
                            </button>
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

      {/* VIEW RECORD MODAL (read-only) */}
      {viewingId && (
        <ViewImpoundModal
          recordId={viewingId}
          onClose={() => setViewingId(null)}
        />
      )}

    </div>
  );
}

/* ------------------------------------------------------------------
   VIEW IMPOUND MODAL (read-only, simple)
------------------------------------------------------------------ */
type ViewImpoundModalProps = {
  recordId: string;
  onClose: () => void;
};

function ViewImpoundModal({ recordId, onClose }: ViewImpoundModalProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "impoundRecords", recordId));
        if (snap.exists()) {
          setData(snap.data());
        } else {
          // Enforcer-issued impound: no impound record, show the violation.
          const v = await getDoc(doc(db, "violations", recordId));
          if (v.exists()) setData(violationAsImpoundRecord(v.data()));
        }
      } catch (err) {
        console.error("Failed to load record:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [recordId]);

  const pick = (v: unknown): string => {
    const s = String(v ?? "").trim();
    return s && s !== "null" && s !== "undefined" ? s : "—";
  };

  const fee = Number(data?.impoundFee ?? 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-content-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">Impound Record</h3>
          <button aria-label="Close" className="modal-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {loading ? (
          <div className="modal-body">
            <p>Loading...</p>
          </div>
        ) : !data ? (
          <div className="modal-body">
            <p>Record not found.</p>
          </div>
        ) : (
          <div className="modal-body">
            <h4 className="form-section-title">UOVR / Ticket</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>UOVR No.</label>
                <div className="read-only-field">{pick(data.uovrNo)}</div>
              </div>
              <div className="form-group">
                <label>CIN</label>
                <div className="read-only-field">{pick(data.cin)}</div>
              </div>
              <div className="form-group">
                <label>AOR No.</label>
                <div className="read-only-field">{pick(data.aorNo)}</div>
              </div>
              <div className="form-group">
                <label>Street</label>
                <div className="read-only-field">{pick(data.street)}</div>
              </div>
              <div className="form-group">
                <label>City / Mun.</label>
                <div className="read-only-field">{pick(data.cityMun)}</div>
              </div>
            </div>

            <h4 className="form-section-title">Driver</h4>
            <div className="modal-grid">
              <div className="form-group form-group-full">
                <label>Name</label>
                <div className="read-only-field">{pick(data.violatorName)}</div>
              </div>
              <div className="form-group form-group-full">
                <label>Address</label>
                <div className="read-only-field">{pick(data.address)}</div>
              </div>
              <div className="form-group">
                <label>License No.</label>
                <div className="read-only-field">{pick(data.licenseNo)}</div>
              </div>
              <div className="form-group">
                <label>Date of Birth</label>
                <div className="read-only-field">{pick(data.dateOfBirth)}</div>
              </div>
            </div>

            <h4 className="form-section-title">Vehicle</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>Plate No.</label>
                <div className="read-only-field">{pick(data.plateNo)}</div>
              </div>
              <div className="form-group">
                <label>Vehicle Type</label>
                <div className="read-only-field">{pick(data.vehicleType)}</div>
              </div>
              <div className="form-group">
                <label>Color</label>
                <div className="read-only-field">{pick(data.color)}</div>
              </div>
              <div className="form-group">
                <label>MV File</label>
                <div className="read-only-field">{pick(data.mvFile)}</div>
              </div>
              <div className="form-group form-group-full">
                <label>Owner</label>
                <div className="read-only-field">{pick(data.vehicleOwner)}</div>
              </div>
              <div className="form-group form-group-full">
                <label>Owner Address</label>
                <div className="read-only-field">
                  {pick(data.vehicleOwnerAddress)}
                </div>
              </div>
            </div>

            <h4 className="form-section-title">Violation</h4>
            <div className="modal-grid">
              <div className="form-group form-group-full">
                <label>Initial Violation</label>
                <div className="read-only-field">
                  {pick(data.initialViolation)}
                </div>
              </div>
              <div className="form-group form-group-full">
                <label>Impound Violations</label>
                <div className="read-only-field">
                  {Array.isArray(data.impoundViolations) &&
                  data.impoundViolations.length > 0
                    ? (data.impoundViolations as string[]).join(", ")
                    : "—"}
                </div>
              </div>
            </div>

            <h4 className="form-section-title">Apprehension</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>Apprehending Officer</label>
                <div className="read-only-field">
                  {pick(data.apprehendingOfficer)}
                </div>
              </div>
              <div className="form-group">
                <label>Deputation No.</label>
                <div className="read-only-field">
                  {pick(data.deputationNo)}
                </div>
              </div>
            </div>

            <h4 className="form-section-title">Location &amp; Fee</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>Impound Location</label>
                <div className="read-only-field">{pick(data.location)}</div>
              </div>
              <div className="form-group">
                <label>Distance (km)</label>
                <div className="read-only-field">{pick(data.distanceKm)}</div>
              </div>
              <div className="form-group">
                <label>Weight Class</label>
                <div className="read-only-field">{pick(data.weightClass)}</div>
              </div>
              <div className="form-group">
                <label>Impound Fee</label>
                <div className="read-only-field fee-value">
                  ₱{fee.toLocaleString()}
                </div>
              </div>
            </div>

            <h4 className="form-section-title">Turn-over</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>Received By</label>
                <div className="read-only-field">{pick(data.receivedBy)}</div>
              </div>
            </div>

            <h4 className="form-section-title">System</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>Status</label>
                <div className="read-only-field">{pick(data.status)}</div>
              </div>
              <div className="form-group">
                <label>Created By</label>
                <div className="read-only-field">{pick(data.createdBy)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}