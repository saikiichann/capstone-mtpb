/* ------------------------------------------------------------------
   IMPOUNDING STAFF — Active Impounding (/impounding-staff/active)

   BAGONG IMPOUND PROCESS:
     - Hiwalay sa clamp. Walang "Subject to Impound".
     - Status: "Impounded" / "Released" lang.
     - Source: impoundRecords kung saan status = "Impounded".
     - View only (Nov 2026): walang Update Status. Kapag bayad na ang
       impound fee (cash sa desk o GCash sa violator app), kusang
       nagiging "Released" ang record at nawawala dito.
   Styles: ./ActiveImpounding.css
------------------------------------------------------------------ */
import { useState, useEffect, useMemo } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import {
  collection,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { encodedAt } from "../../lib/impoundOrder";
import "./ActiveImpounding.css";

// Assets
import overviewIcon from "../../assets/overview.png";
import impoundingLogIcon from "../../assets/impounding.png";
import activeImpoundingIcon from "../../assets/tow-truck.png";
import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */


type ImpoundStatus = "Impounded" | "Released";

type ImpoundRow = {
  id: string;
  uovrNo: string;
  cin: string;
  plateNo: string;
  location: string;
  officer: string;
  impoundedAt: Timestamp | null;
  /** Order in the list: when the record was saved (lib/impoundOrder.ts). */
  sortKey: number;
  hoursSinceImpound: number;
  impoundFee: number;
  status: ImpoundStatus;
};

type Metrics = {
  totalImpounded: number;
  avgHours: number;
  totalFees: number;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;



const navGroups: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/impounding-staff" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      {
        label: "Impound Records",
        icon: impoundingLogIcon,
        path: "/impounding-staff/log",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Vehicles in Yard",
        icon: activeImpoundingIcon,
        path: "/impounding-staff/active",
        active: true,
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


const computeHoursSince = (ts: Timestamp | null): number => {
  if (!ts) return 0;
  try {
    const date = ts.toDate();
    const now = new Date();
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3600000));
  } catch {
    return 0;
  }
};

const formatCurrency = (n: number): string =>
  `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const getStatusClass = (status: ImpoundStatus): string =>
  status === "Released" ? "status-released" : "status-impounded";

/* ------------------------------------------------------------------
   DETAILS MODAL (view only)
   No status change here: a vehicle is released automatically once its
   impound fee is paid, in cash at the desk or by GCash on the violator
   app. Then it leaves this list on its own.
------------------------------------------------------------------ */
type DetailsModalProps = {
  row: ImpoundRow;
  onClose: () => void;
};

function DetailsModal({ row, onClose }: DetailsModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="impound-details-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title" id="impound-details-title">{row.cin}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="info-box">
            <div className="info-row">
              <span className="info-label">UOVR No.:</span>
              <span className="info-value">{row.uovrNo}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Plate:</span>
              <span className="info-value">{row.plateNo}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Location:</span>
              <span className="info-value">{row.location}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Impounded by:</span>
              <span className="info-value">{row.officer}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Impounded at:</span>
              <span className="info-value">
                {formatDateTime(row.impoundedAt)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Hours since impound:</span>
              <span className="info-value">{row.hoursSinceImpound} hrs</span>
            </div>
            <div className="info-row">
              <span className="info-label">Impound Fee:</span>
              <span className="info-value">{formatCurrency(row.impoundFee)}</span>
            </div>
          </div>

          <p className="yard-note">
            Not paid yet. Once the impound fee is paid (cash at the desk or GCash), the vehicle is
            released automatically and leaves this list.
          </p>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   MAIN COMPONENT
------------------------------------------------------------------ */
export default function ActiveImpounding() {


  const [rows, setRows] = useState<ImpoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<ImpoundRow | null>(null);
  const [currentPage, setCurrentPage] = useState(1);


  /**
   * Fetch impoundRecords — active ones lang (status = "Impounded").
   * Walang orderBy(): client-side sorting para hindi madrop ang records
   * na walang clampedAt.
   */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "impoundRecords"),
      (snap) => {
        const activeRows: ImpoundRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            const impoundedAt: Timestamp | null =
              ((data.clampedAt ?? data.ticketDate ?? data.createdAt) as Timestamp) ?? null;

            return {
              id: d.id,
              uovrNo: data.uovrNo ?? "—",
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              location: data.location ?? "—",
              officer:
                data.clampedBy ??
                data.towedBy ??
                data.impoundedBy ??
                "—",
              impoundedAt,
              sortKey: encodedAt(d),
              hoursSinceImpound: computeHoursSince(impoundedAt),
              impoundFee: Number(data.impoundFee ?? 0),
              status: (data.status ?? "Impounded") as ImpoundStatus,
            };
          })
          .filter((r) => r.status === "Impounded")
          .sort((a, b) => b.sortKey - a.sortKey);

        setRows(activeRows);
        setLoading(false);
      },
      (err) => {
        console.warn("Active impound fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Escape key for modal */
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && selectedRow) {
        setSelectedRow(null);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedRow]);

  /* Metrics */
  const metrics: Metrics = useMemo(() => {
    const totalHours = rows.reduce((sum, r) => sum + r.hoursSinceImpound, 0);
    const totalFees = rows.reduce((sum, r) => sum + r.impoundFee, 0);
    return {
      totalImpounded: rows.length,
      avgHours: rows.length > 0 ? Math.round(totalHours / rows.length) : 0,
      totalFees,
    };
  }, [rows]);

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = rows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Keep the page valid if the list shrinks (during render)
  if (currentPage > totalPages) setCurrentPage(totalPages);

  /* Update status: Impounded → Released */


  const metricCards = [
    {
      title: "Currently Impounded",
      value: String(metrics.totalImpounded),
      subtitle: "Active vehicles in the impound yard",
    },
    {
      title: "Avg. hours since impound",
      value: `${metrics.avgHours}h`,
      subtitle: "",
    },
    {
      title: "Total impound fees",
      value: formatCurrency(metrics.totalFees),
      subtitle: "",
    },
  ];

  return (
    <div className="impounding-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={navGroups} role={<>Impounding Staff</>} />

        {/* MAIN CONTENT */}
        <div className="main">
          <AppTopbar groups={navGroups} />
          <header className="main-header">
            <div>
              <h1>Vehicles in Yard</h1>
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
            {/* METRIC CARDS */}
            <div className="metric-grid-three">
              {metricCards.map((card) => (
                <div key={card.title} className="card metric-card">
                  <p className="metric-title">{card.title}</p>
                  <p className="metric-value">{card.value}</p>
                  {card.subtitle && (
                    <p className="metric-subtitle">{card.subtitle}</p>
                  )}
                </div>
              ))}
            </div>

            {/* ACTIVE IMPOUNDING TABLE */}
            <div className="card active-card">
              <div className="active-header">
                <p className="card-eyebrow">Currently in the yard</p>
                <h2 className="card-title">Vehicles in Yard</h2>
                <p className="yard-list-note">
                  Unpaid impounds. A vehicle leaves this list automatically once its fee is paid (cash or GCash).
                </p>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading active operations...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="table-empty">
                  <p>No active impounding operations.</p>
                </div>
              ) : (
                <>
                  <div className="impound-table-wrapper" tabIndex={0} role="region" aria-label="Impound records table" data-scroll-region>
                    <table className="impound-table">
                      <thead>
                        <tr>
                          <th>UOVR No.</th>
                          <th>CIN</th>
                          <th>Plate No.</th>
                          <th>Location</th>
                          <th>Impounded by</th>
                          <th>Impounded</th>
                          <th>Hours</th>
                          <th>Fee</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => setSelectedRow(row)}
                            className="impound-row-clickable"
                          >
                            <td className="cell-reference">{row.uovrNo}</td>
                            <td>
                              <span className="cin-pill">{row.cin}</span>
                            </td>
                            <td className="cell-plate">{row.plateNo}</td>
                            <td className="cell-location">{row.location}</td>
                            <td className="cell-clamped-by">{row.officer}</td>
                            <td className="cell-time">
                              {formatDateTime(row.impoundedAt)}
                            </td>
                            <td className="cell-overdue">
                              {row.hoursSinceImpound}h
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* PAGINATION */}
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
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* UPDATE MODAL */}
      {selectedRow && (
        <DetailsModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
}