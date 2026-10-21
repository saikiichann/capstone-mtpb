/* ------------------------------------------------------------------
   Impound (UOVR) records panel — the table every role sees, with the
   actions that role may take:

     staff        Impounding Staff: encode a ticket, edit one still For
                  Payment, view.
     staff-active Impounding Staff: vehicles still in the lot (For Payment),
                  with days in the lot.
     oic          OIC: all records; receive the impounding fee.
     oic-payments OIC: only For Payment, to receive the fee.
     supervisor   Supervisor: all records; edit details with a reason.
     records      Record Officer: view only.
------------------------------------------------------------------ */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import {
  VEHICLE_CLASSES,
  daysInLot,
  formatRecordDate,
  pesoText,
  useImpoundRecords,
  vehicleClassLabel,
  type ImpoundRecord,
} from "../../lib/impoundRecords";
import UovrTicketModal from "./UovrTicketModal";
import ImpoundRecordDetails from "./ImpoundRecordDetails";
import ImpoundPaymentModal from "./ImpoundPaymentModal";
import "./impound.css";

export type ImpoundPanelMode =
  | "staff"
  | "staff-active"
  | "oic"
  | "oic-payments"
  | "supervisor"
  | "records";

type Props = {
  mode: ImpoundPanelMode;
  currentUserName: string;
  /** Card title; defaults by mode */
  title?: string;
  /** Show only the first N rows, without the toolbar (dashboards) */
  limit?: number;
  /** "View all" link for a limited preview */
  onViewAll?: () => void;
};

const ITEMS_PER_PAGE = 10;

const DEFAULT_TITLES: Record<ImpoundPanelMode, string> = {
  staff: "Impounding Log",
  "staff-active": "Vehicles in the Impound Lot",
  oic: "Impounding Log",
  "oic-payments": "Impounding Fees for Payment",
  supervisor: "Impounding Log",
  records: "Impounding Log",
};

const SUBTITLES: Record<ImpoundPanelMode, string> = {
  staff: "UOVR (Blue Ticket) records encoded at the impound lot.",
  "staff-active": "Waiting for the impounding fee to be paid to the OIC.",
  oic: "UOVR records from the Impounding Staff. Receive the impounding fee to release a vehicle.",
  "oic-payments": "Encoded by the Impounding Staff. Receiving the fee releases the vehicle.",
  supervisor: "UOVR records from the Impounding Staff.",
  records: "UOVR records from the Impounding Staff.",
};

type StatusFilter = "All" | "For Payment" | "Released";

export default function ImpoundRecordsPanel({ mode, currentUserName, title, limit, onViewAll }: Props) {
  const { records, loading, error } = useImpoundRecords();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [vehicleClass, setVehicleClass] = useState("All");
  const [page, setPage] = useState(1);

  const [encoding, setEncoding] = useState(false);
  const [editing, setEditing] = useState<ImpoundRecord | null>(null);
  const [viewing, setViewing] = useState<ImpoundRecord | null>(null);
  const [paying, setPaying] = useState<ImpoundRecord | null>(null);
  const [notice, setNotice] = useState("");

  const onlyForPayment = mode === "staff-active" || mode === "oic-payments";
  const canEncode = mode === "staff";
  const canPay = mode === "oic" || mode === "oic-payments";
  const preview = typeof limit === "number";

  const scoped = useMemo(
    () => (onlyForPayment ? records.filter((r) => r.status === "For Payment") : records),
    [records, onlyForPayment]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return scoped.filter((r) => {
      if (status !== "All" && r.status !== status) return false;
      if (vehicleClass !== "All" && r.vehicleClass !== vehicleClass) return false;
      if (!q) return true;
      return [r.uovrNo, r.plateNo, r.violatorName, r.location, r.vehicleType]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [scoped, search, status, vehicleClass]);

  useEffect(() => setPage(1), [search, status, vehicleClass]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * ITEMS_PER_PAGE;
  const rows = preview ? filtered.slice(0, limit) : filtered.slice(start, start + ITEMS_PER_PAGE);

  const forPayment = records.filter((r) => r.status === "For Payment");
  const released = records.filter((r) => r.status === "Released");

  const showStatusColumn = !onlyForPayment;

  return (
    <div className="ir-card">
      <div className="ir-head">
        <div>
          <p className="ir-eyebrow">Sector 3 · Impound</p>
          <h2 className="ir-title">{title ?? DEFAULT_TITLES[mode]}</h2>
          {!preview && <p className="ir-sub">{SUBTITLES[mode]}</p>}
        </div>
        <div className="ir-head-meta">
          <span className="ir-counts">
            <strong>{forPayment.length}</strong> for payment
            {!onlyForPayment && (
              <>
                {" "}
                · <strong>{released.length}</strong> released
              </>
            )}
          </span>
          {canEncode && (
            <button type="button" className="ir-btn ir-btn-primary" onClick={() => setEncoding(true)}>
              <Plus size={16} /> Encode UOVR Ticket
            </button>
          )}
          {preview && onViewAll && (
            <button type="button" className="ir-link" onClick={onViewAll}>
              View all
            </button>
          )}
        </div>
      </div>

      {notice && <p className="ir-notice">{notice}</p>}

      {!preview && (
        <div className="ir-toolbar">
          <label className="ir-search">
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search UOVR No., plate no., name, place..."
              aria-label="Search impound records"
            />
          </label>
          {!onlyForPayment && (
            <select
              className="ir-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Status"
            >
              <option value="All">All Status</option>
              <option value="For Payment">For Payment</option>
              <option value="Released">Released</option>
            </select>
          )}
          <select
            className="ir-select"
            value={vehicleClass}
            onChange={(e) => setVehicleClass(e.target.value)}
            aria-label="Vehicle class"
          >
            <option value="All">All Vehicle Classes</option>
            {VEHICLE_CLASSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label} ({pesoText(c.fee)})
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="ir-loading">Loading impound records...</div>
      ) : error ? (
        <div className="ir-error">{error}</div>
      ) : rows.length === 0 ? (
        <div className="ir-empty">
          {scoped.length === 0
            ? onlyForPayment
              ? "No vehicles waiting for payment."
              : canEncode
                ? "No UOVR tickets yet. Use “Encode UOVR Ticket” to add one."
                : "No impound records yet."
            : "No records match your search or filter."}
        </div>
      ) : (
        <div className="ir-table-wrap">
          <table className="ir-table">
            <thead>
              <tr>
                <th>UOVR No.</th>
                <th>Plate No.</th>
                <th>Vehicle</th>
                <th>Violations</th>
                <th>Apprehended</th>
                {onlyForPayment && <th className="ir-num">Days in lot</th>}
                <th className="ir-num">Impounding Fee</th>
                {showStatusColumn && <th>Status</th>}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const canEditRow =
                  (mode === "staff" && r.status === "For Payment") || mode === "supervisor";
                return (
                  <tr key={r.id}>
                    <td>
                      <span className={`ir-uovr ${r.uovrNo ? "" : "ir-uovr-missing"}`}>
                        {r.uovrNo || "No UOVR"}
                      </span>
                    </td>
                    <td className="ir-plate">{r.plateNo || "—"}</td>
                    <td>
                      <div>{r.vehicleType || "—"}</div>
                      <span className="ir-class">{vehicleClassLabel(r.vehicleClass)}</span>
                    </td>
                    <td>
                      {r.violations[0] ?? (r.remarks || "—")}
                      {r.violations.length > 1 && (
                        <div className="ir-muted">+{r.violations.length - 1} more</div>
                      )}
                    </td>
                    <td className="ir-nowrap">
                      <div>{formatRecordDate(r.apprehendedAt, false)}</div>
                      <div className="ir-muted">{r.location || "—"}</div>
                    </td>
                    {onlyForPayment && <td className="ir-num">{daysInLot(r)}</td>}
                    <td className="ir-num">{r.impoundFee ? pesoText(r.impoundFee) : "—"}</td>
                    {showStatusColumn && (
                      <td>
                        <span
                          className={`ir-pill ${
                            r.status === "Released" ? "ir-pill-released" : "ir-pill-for-payment"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    )}
                    <td>
                      <div className="ir-actions">
                        {canPay && r.status === "For Payment" && (
                          <button
                            type="button"
                            className="ir-btn ir-btn-sm ir-btn-pay"
                            onClick={() => setPaying(r)}
                          >
                            Receive Payment
                          </button>
                        )}
                        {canEditRow && (
                          <button
                            type="button"
                            className="ir-btn ir-btn-sm"
                            onClick={() => setEditing(r)}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          className="ir-btn ir-btn-sm"
                          onClick={() => setViewing(r)}
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!preview && !loading && filtered.length > 0 && (
        <div className="ir-pagination">
          <span className="ir-page-count">
            Showing {start + 1}–{start + rows.length} of {filtered.length}
          </span>
          <button
            type="button"
            className="ir-btn ir-btn-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <span>
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            className="ir-btn ir-btn-sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {encoding && (
        <UovrTicketModal
          mode="encode"
          existing={records}
          currentUserName={currentUserName}
          onClose={() => setEncoding(false)}
          onSaved={setNotice}
        />
      )}
      {editing && (
        <UovrTicketModal
          mode={mode === "supervisor" ? "supervisor" : "edit"}
          record={editing}
          existing={records}
          currentUserName={currentUserName}
          onClose={() => setEditing(null)}
          onSaved={setNotice}
        />
      )}
      {viewing && <ImpoundRecordDetails record={viewing} onClose={() => setViewing(null)} />}
      {paying && (
        <ImpoundPaymentModal
          record={paying}
          officerName={currentUserName}
          onClose={() => setPaying(null)}
          onPaid={setNotice}
        />
      )}
    </div>
  );
}
