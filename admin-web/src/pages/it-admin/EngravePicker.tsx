/* ------------------------------------------------------------------
   QR Management → "Download SVGs": choose which clamps to download for
   laser engraving (e.g. only 10 first for a test batch).

   - "How many" picks the first N in the list (sorted by clamp ID).
   - Tick / untick single clamps, search, Select all / Clear.
   The list is whatever QR Management is showing (its filters apply).
------------------------------------------------------------------ */
import { useMemo, useState } from "react";
import { Download, Search, X } from "lucide-react";
import { TAG_SIZE_IN } from "../../lib/engraveQr";

export type EngraveClamp = {
  id: string;
  clampId: string;
  clampType: string;
  scanToken: string | null;
};

const byClampId = (a: EngraveClamp, b: EngraveClamp) =>
  a.clampId.localeCompare(b.clampId, undefined, { numeric: true });

export default function EngravePicker({
  clamps,
  busy,
  onCancel,
  onDownload,
}: {
  clamps: EngraveClamp[];
  busy: boolean;
  onCancel: () => void;
  onDownload: (selected: EngraveClamp[]) => void;
}) {
  const sorted = useMemo(() => [...clamps].sort(byClampId), [clamps]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(sorted.map((c) => c.id)));
  const [howMany, setHowMany] = useState(String(sorted.length));
  const [search, setSearch] = useState("");

  const q = search.trim().toUpperCase();
  const shown = q ? sorted.filter((c) => c.clampId.toUpperCase().includes(q)) : sorted;
  const picked = sorted.filter((c) => selected.has(c.id));
  const noToken = picked.filter((c) => !c.scanToken).length;

  const pickFirst = (value: string) => {
    setHowMany(value);
    const count = Math.max(0, Math.min(sorted.length, Math.floor(Number(value) || 0)));
    setSelected(new Set(sorted.slice(0, count).map((c) => c.id)));
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setHowMany(String(next.size));
  };

  const setAll = (on: boolean) => {
    setSelected(on ? new Set(sorted.map((c) => c.id)) : new Set());
    setHowMany(on ? String(sorted.length) : "0");
  };

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onCancel}>
      <div className="modal-content engrave-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Download QR for engraving</h3>
          <button className="modal-close-btn" onClick={onCancel} disabled={busy} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="engrave-controls">
            <label className="engrave-count">
              <span>How many</span>
              <input
                type="number"
                min={0}
                max={sorted.length}
                value={howMany}
                onChange={(e) => pickFirst(e.target.value)}
                disabled={busy}
              />
              <small>of {sorted.length} (first in the list)</small>
            </label>
            <div className="engrave-quick">
              <button type="button" onClick={() => setAll(true)} disabled={busy}>
                Select all
              </button>
              <button type="button" onClick={() => setAll(false)} disabled={busy}>
                Clear
              </button>
            </div>
          </div>

          <div className="engrave-search">
            <Search size={15} />
            <input
              type="text"
              placeholder="Find a clamp ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={busy}
            />
          </div>

          <ul className="engrave-list">
            {shown.length === 0 && <li className="engrave-empty">No clamp matches.</li>}
            {shown.map((c) => (
              <li key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    disabled={busy}
                  />
                  <span className="engrave-id">{c.clampId}</span>
                  <span className="engrave-type">{c.clampType}</span>
                  {!c.scanToken && <span className="engrave-notoken">No token yet</span>}
                </label>
              </li>
            ))}
          </ul>

          <p className="modal-note">
            Each SVG is a {TAG_SIZE_IN} in tag. Don't re-issue a token after its tag is engraved, or the
            engraved QR stops working.
            {noToken > 0 && (
              <>
                {" "}
                <strong>
                  {noToken} selected clamp{noToken > 1 ? "s have" : " has"} no token yet — one will be
                  issued for {noToken > 1 ? "them" : "it"}.
                </strong>
              </>
            )}
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => onDownload(picked)}
            disabled={busy || picked.length === 0}
          >
            <Download size={16} />
            <span>{busy ? "Preparing..." : `Download ${picked.length} SVG${picked.length === 1 ? "" : "s"}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
