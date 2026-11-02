/* ------------------------------------------------------------------
   RELEASE DETAILS — centered window for the Release Officer

   Click a vehicle in the Release Queue / Overview / Release Log and this
   panel shows everything needed to hand over the right vehicle to the
   right person: who claims it, the vehicle, where it is (with map and the
   enforcer's evidence photo), the violation, payment and approval.

   Reads the violation live, so it updates if someone else releases it.
------------------------------------------------------------------ */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BadgeCheck,
  Banknote,
  Car,
  Clock,
  FileText,
  ImageOff,
  Loader2,
  MapPin,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { doc, onSnapshot, type DocumentData, type Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { locationDetailsOf } from "../lib/locationDetails";
import StampedPhoto from "./StampedPhoto";
import { useRegisteredOwnerLookup } from "../lib/registeredOwners";
import { RELEASE_QUEUE_STATUS } from "../lib/release";
import "./ReleaseDetailsDrawer.css";

const peso = (n: unknown) =>
  `₱${Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (ts: unknown): string => {
  const t = ts as Timestamp | null | undefined;
  if (!t || typeof t.toDate !== "function") return "—";
  try {
    return t.toDate().toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const minutesSince = (ts: unknown): number | null => {
  const t = ts as Timestamp | null | undefined;
  if (!t || typeof t.toMillis !== "function") return null;
  return Math.max(0, Math.floor((Date.now() - t.toMillis()) / 60000));
};

const waitLabel = (mins: number | null) => {
  if (mins == null) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hr ${mins % 60} min`;
  return `${Math.floor(h / 24)} day${h >= 48 ? "s" : ""} ${h % 24} hr`;
};

const text = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s || "—";
};

function photosOf(data: DocumentData): string[] {
  const list = [
    data.photoUrl,
    ...(Array.isArray(data.evidencePhotos) ? data.evidencePhotos : []),
    ...(Array.isArray(data.photos) ? data.photos : []),
  ];
  return Array.from(new Set(list.filter((u): u is string => typeof u === "string" && u.startsWith("http"))));
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rd-section">
      <h3 className="rd-section-title">
        <span className="rd-section-icon">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`rd-field${wide ? " rd-field-wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function ReleaseDetailsDrawer({
  violationId,
  onClose,
  onRelease,
}: {
  violationId: string;
  onClose: () => void;
  /** Shown only where releasing is allowed (Release Queue / Overview). */
  onRelease?: (violationId: string) => Promise<void>;
}) {
  const [data, setData] = useState<DocumentData | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const ownerOf = useRegisteredOwnerLookup();

  // Live: if someone else releases it, the panel shows it right away.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "violations", violationId),
      (snap) => {
        setMissing(!snap.exists());
        setData(snap.exists() ? snap.data() : null);
      },
      (err) => {
        console.warn("Release details not loaded:", err.code);
        setMissing(true);
      }
    );
    return () => unsubscribe();
  }, [violationId]);

  // Esc closes; the page behind doesn't scroll while the panel is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, busy]);

  const loading = !data && !missing;
  const details = data ? locationDetailsOf(data) : null;
  const photos = data ? photosOf(data) : [];
  const photo = photos[Math.min(photoIndex, photos.length - 1)];

  const owner = data && !data.violatorUid ? ownerOf(data.plateNo) : null;
  const violatorName = (data?.violatorName as string) || owner?.name || null;
  const isRegistered = Boolean(data?.violatorUid || owner);

  const released = data?.releaseStatus === "Released";
  const approved = data?.releaseStatus === RELEASE_QUEUE_STATUS;
  const paid = data?.paymentStatus === "Verified";
  const canRelease = Boolean(onRelease && approved && paid);

  const status = released
    ? { label: "Released", cls: "rd-status-released" }
    : approved && paid
    ? { label: "Ready for release", cls: "rd-status-ready" }
    : approved
    ? { label: "Awaiting verification", cls: "rd-status-wait" }
    : { label: text(data?.releaseStatus), cls: "rd-status-other" };

  const vehicleLine = [data?.vehicleMake, data?.vehicleType, data?.vehicleColor]
    .filter((v) => v && v !== "—")
    .join(" · ");

  const handleRelease = async () => {
    if (!onRelease || busy) return;
    setBusy(true);
    try {
      await onRelease(violationId);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="rd-overlay" onMouseDown={busy ? undefined : onClose}>
      <aside
        className="rd-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rd-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <header className="rd-header">
          <div className="rd-header-top">
            <span className="rd-eyebrow">Release details</span>
            <button type="button" className="rd-close" onClick={onClose} disabled={busy} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {loading ? (
            <div className="rd-skeleton rd-skeleton-title" />
          ) : missing ? (
            <h2 id="rd-title" className="rd-title">
              Record not found
            </h2>
          ) : (
            <>
              <div className="rd-title-row">
                <h2 id="rd-title" className="rd-title">
                  {text(data?.plateNo)}
                </h2>
                <span className={`rd-status ${status.cls}`}>{status.label}</span>
              </div>
              <p className="rd-subtitle">
                <span className="rd-cin">{text(data?.cin)}</span>
                {vehicleLine && <span>{vehicleLine}</span>}
              </p>
            </>
          )}
        </header>

        {/* BODY */}
        <div className="rd-body" tabIndex={0} aria-label="Release details" data-scroll-region>
          {loading && (
            <div className="rd-loading">
              <Loader2 size={20} className="rd-spin" />
              Loading details...
            </div>
          )}

          {missing && (
            <p className="rd-empty">This violation no longer exists or you can't open it.</p>
          )}

          {data && details && (
            <>
              {/* PICK-UP CHECK */}
              <div className="rd-check">
                <p className="rd-check-title">
                  <BadgeCheck size={16} />
                  {released ? "Released to" : "Check before releasing"}
                </p>
                <div className="rd-check-grid">
                  <div>
                    <span className="rd-check-label">Claimant</span>
                    <span className="rd-check-value">{violatorName ?? "Guest (no name)"}</span>
                    <span className={`rd-tag ${isRegistered ? "rd-tag-reg" : "rd-tag-guest"}`}>
                      {isRegistered ? "Registered" : "Guest"}
                    </span>
                  </div>
                  <div>
                    <span className="rd-check-label">Plate</span>
                    <span className="rd-check-value rd-mono">{text(data.plateNo)}</span>
                  </div>
                  <div>
                    <span className="rd-check-label">Clamp</span>
                    <span className="rd-check-value rd-mono">{text(data.clampId)}</span>
                  </div>
                </div>
              </div>

              {/* LOCATION */}
              <Section icon={<MapPin size={15} />} title="Location">
                <div className="rd-location">
                  <div className="rd-location-main">
                    <div className="rd-location-chips">
                      {details.district && <span className="rd-chip">{details.district}</span>}
                      <span className="rd-chip rd-chip-soft">{details.barangay ?? "Barangay —"}</span>
                    </div>
                    <p className="rd-location-street">{details.exact}</p>
                    {details.coords && (
                      <p className="rd-muted rd-mono">
                        {details.coords.lat.toFixed(5)}, {details.coords.lng.toFixed(5)}
                      </p>
                    )}
                  </div>
                  {details.mapUrl && (
                    <a className="rd-btn rd-btn-map" href={details.mapUrl} target="_blank" rel="noopener noreferrer">
                      <MapPin size={15} />
                      Open map
                    </a>
                  )}
                </div>
              </Section>

              {/* EVIDENCE PHOTO */}
              <Section icon={<Car size={15} />} title="Evidence photo">
                {photo ? (
                  <>
                    <StampedPhoto src={photo} data={data} alt={`Evidence photo of ${text(data.plateNo)}`} />
                    {photos.length > 1 && (
                      <div className="rd-thumbs">
                        {photos.map((url, i) => (
                          <button
                            key={url}
                            type="button"
                            className={`rd-thumb${i === photoIndex ? " active" : ""}`}
                            onClick={() => setPhotoIndex(i)}
                            aria-label={`Photo ${i + 1}`}
                          >
                            <img src={url} alt="" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rd-photo-empty">
                    <ImageOff size={20} />
                    No photo for this violation
                  </div>
                )}
              </Section>

              {/* VIOLATION */}
              <Section icon={<FileText size={15} />} title="Violation">
                <dl className="rd-grid">
                  <Field label="Violation" wide>
                    {text(data.violationType)}
                  </Field>
                  <Field label="Clamped on">{when(data.recordedAt ?? data.clampedAt ?? data.ticketDate)}</Field>
                  <Field label="Enforcer">{text(data.officer ?? data.officerName)}</Field>
                  <Field label="Fine">{peso(data.fineAmount)}</Field>
                  <Field label="Type">{text(data.enforcementType)}</Field>
                </dl>
              </Section>

              {/* PAYMENT */}
              <Section icon={<Banknote size={15} />} title="Payment">
                <dl className="rd-grid">
                  <Field label="Amount paid">
                    <strong>{peso(data.totalPaid ?? data.fineAmount)}</strong>
                  </Field>
                  <Field label="Method">{text(data.paymentMethod)}</Field>
                  <Field label="Reference No.">
                    <span className="rd-mono">{text(data.referenceNumber ?? data.paymentReference)}</span>
                  </Field>
                  <Field label="OR No.">
                    <span className="rd-mono">{text(data.orNumber)}</span>
                  </Field>
                  <Field label="Verified by">{text(data.verifiedBy)}</Field>
                  <Field label="Verified on">{when(data.verifiedAt)}</Field>
                </dl>
              </Section>

              {/* APPROVAL / RELEASE */}
              <Section icon={<ShieldCheck size={15} />} title={released ? "Release" : "Approval"}>
                <dl className="rd-grid">
                  <Field label="Approved by">
                    {text(data.oicApprovedBy)}
                    {data.oicApprovedByRole ? (
                      <span className="rd-muted"> ({String(data.oicApprovedByRole)})</span>
                    ) : null}
                  </Field>
                  <Field label="Approved on">{when(data.oicApprovedAt)}</Field>
                  {released ? (
                    <>
                      <Field label="Release order">
                        <span className="rd-mono">{text(data.releaseOrderId)}</span>
                      </Field>
                      <Field label="Released by">{text(data.releasedBy)}</Field>
                      <Field label="Released on">{when(data.releasedAt)}</Field>
                    </>
                  ) : (
                    <Field label="Waiting since payment">
                      <span className="rd-wait">
                        <Clock size={13} />
                        {waitLabel(minutesSince(data.verifiedAt))}
                      </span>
                    </Field>
                  )}
                </dl>
              </Section>

              <p className="rd-foot-note">
                <User size={12} /> Ask for a valid ID and the payment slip or receipt before releasing.
              </p>
            </>
          )}
        </div>

        {/* FOOTER */}
        <footer className="rd-footer">
          <button type="button" className="rd-btn rd-btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          {onRelease && data && !released && (
            <button
              type="button"
              className="rd-btn rd-btn-primary"
              onClick={() => void handleRelease()}
              disabled={!canRelease || busy}
              title={canRelease ? "Mark this vehicle as released" : "Payment not yet verified"}
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="rd-spin" /> Releasing...
                </>
              ) : (
                <>
                  <BadgeCheck size={16} /> Mark as Released
                </>
              )}
            </button>
          )}
        </footer>
      </aside>
    </div>,
    document.body
  );
}
