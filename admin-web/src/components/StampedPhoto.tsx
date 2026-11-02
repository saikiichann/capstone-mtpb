/* ------------------------------------------------------------------
   STAMPED PHOTO — evidence photo with the Marki-style location stamp

   The enforcer app saves the ORIGINAL photo as the evidence and no longer
   burns the stamp into the image (on some phones the burned-in copy came
   out black). So the stamp is drawn here, over the photo, from what was
   saved on the violation: exact address, GPS, time, clamp, plate and
   enforcer — the same lines the enforcer app shows.

   Older photos that already have the stamp in the image
   (`photoStamped: true`) are shown as they are, so it never shows twice.

   Click the photo → full-size viewer, still with the stamp. The original
   file can be opened from there.
------------------------------------------------------------------ */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Maximize2, X } from "lucide-react";
import type { DocumentData } from "firebase/firestore";
import "./StampedPhoto.css";

const OSM_CREDIT = "© OpenStreetMap contributors";

type Stamp = {
  place: string;
  coordLine: string | null;
  detailLine: string;
  officerLine: string | null;
  credit: string | null;
};

const toMillis = (v: unknown): number | null => {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return null;
};

/** The stamp lines, from the saved violation (same as the enforcer app). */
function stampOf(data: DocumentData): Stamp {
  const a = data.address as
    | { street?: string; barangay?: string; district?: string; city?: string; accuracyM?: number }
    | null
    | undefined;
  const address = a ? [a.street, a.barangay, a.district, a.city].filter(Boolean).join(", ") : "";
  const place =
    address || [data.location, data.barangay].filter(Boolean).join(", ") || "Location not recorded";

  const c = data.locationCoords as { lat?: number; lng?: number } | undefined;
  const coordLine =
    c?.lat != null && c?.lng != null
      ? `${Number(c.lat).toFixed(5)}, ${Number(c.lng).toFixed(5)}` +
        (a?.accuracyM != null ? `  ±${a.accuracyM} m` : "")
      : null;

  const ms = toMillis(data.recordedAt ?? data.clampedAt ?? data.ticketDate);
  const time = ms
    ? new Date(ms).toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const detailLine = [time, data.clampId ? `Clamp ${data.clampId}` : null, data.plateNo]
    .filter(Boolean)
    .join("  ·  ");

  const officer = data.officer ?? data.officerName;
  return {
    place,
    coordLine,
    detailLine,
    officerLine: officer ? `MTPB Enforcer: ${officer}` : null,
    credit: a ? OSM_CREDIT : null,
  };
}

function StampBox({ stamp, large }: { stamp: Stamp; large?: boolean }) {
  return (
    <div className={`sp-stamp${large ? " sp-stamp-lg" : ""}`}>
      <p className="sp-stamp-title">{stamp.place}</p>
      {stamp.coordLine && <p className="sp-stamp-line">{stamp.coordLine}</p>}
      {stamp.detailLine && <p className="sp-stamp-line">{stamp.detailLine}</p>}
      {stamp.officerLine && <p className="sp-stamp-line">{stamp.officerLine}</p>}
      {stamp.credit && <p className="sp-stamp-credit">{stamp.credit}</p>}
    </div>
  );
}

export default function StampedPhoto({
  src,
  data,
  alt,
  className = "",
}: {
  src: string;
  /** The violation document (for the stamp). */
  data: DocumentData;
  alt: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  // Only the main evidence photo carries the ticket's stamp, and only when
  // the stamp is not already burned into the image.
  const showStamp = data.photoStamped !== true && src === data.photoUrl;
  const stamp = stampOf(data);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Close only the viewer, not the details window under it.
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  const close = () => {
    setOpen(false);
    openerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        className={`sp-frame ${className}`}
        onClick={() => setOpen(true)}
        aria-label={`${alt}. Open full size`}
      >
        <img src={src} alt={alt} loading="lazy" />
        {showStamp && <StampBox stamp={stamp} />}
        <span className="sp-open">
          <Maximize2 size={13} /> Full size
        </span>
      </button>

      {open &&
        createPortal(
          <div className="sp-viewer" role="dialog" aria-modal="true" aria-label={alt} onClick={close}>
            <div className="sp-viewer-bar" onClick={(e) => e.stopPropagation()}>
              <a className="sp-viewer-btn" href={src} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={15} /> Original file
              </a>
              <button ref={closeRef} type="button" className="sp-viewer-btn" onClick={close} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <figure className="sp-viewer-photo" onClick={(e) => e.stopPropagation()}>
              <img src={src} alt={alt} />
              {showStamp && <StampBox stamp={stamp} large />}
            </figure>
          </div>,
          document.body
        )}
    </>
  );
}
