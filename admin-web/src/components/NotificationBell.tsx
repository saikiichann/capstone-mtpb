import { useState, useEffect, useRef } from "react";
import { Bell, CheckCircle2, Loader2, Volume2, VolumeX, XCircle } from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { markAllNotificationsAsRead } from "../lib/notifications";
import { confirmAndRelease } from "../lib/releaseFlow";
import {
  isNotificationSoundOn,
  playNotificationSound,
  setNotificationSoundOn,
  unlockNotificationSound,
} from "../lib/notificationSound";
import "./NotificationBell.css";

export type NotificationType = "release-approved" | "release-denied" | "release-rejected" | string;

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Timestamp | null;
  /** violationId, cin, plateNo… (lib/notifications.ts) */
  metadata: Record<string, unknown>;
  /** Set once the vehicle was released from this notification. */
  resolution: string | null;
};

const formatRelativeTime = (ts: Timestamp | null): string => {
  if (!ts) return "just now";
  try {
    const diffMs = new Date().getTime() - ts.toDate().getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
    if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
    return `${days} day${days > 1 ? "s" : ""} ago`;
  } catch {
    return "just now";
  }
};

const canReleaseFrom = (n: NotificationRow): boolean =>
  n.type === "release-approved" &&
  typeof n.metadata.violationId === "string" &&
  n.resolution !== "released";

/**
 * In-app notifications para sa MTPB staff.
 *
 * - May tunog (chime) kapag may bagong unread notification habang bukas ang
 *   page. Pwedeng i-off sa speaker button; naaalala per browser.
 * - "Mark as Released" sa mga "ready for release" na notification, gamit ang
 *   parehong release flow ng Release Queue (lib/release.ts).
 *
 * Tandaan: staff-facing lang ito. Walang push notification sa violators —
 * naka-exclude yun sa Delimitations ng paper.
 */
export function NotificationBell({
  currentUserUid,
  officerName,
}: {
  currentUserUid: string;
  /** Name written on the release (Release Officer pages). */
  officerName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [soundOn, setSoundOn] = useState(isNotificationSoundOn);
  const [busyId, setBusyId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  // Browsers allow sound only after the user interacts with the page.
  useEffect(() => {
    const unlock = () => unlockNotificationSound();
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!currentUserUid) return;
    let firstSnapshot = true;
    const q = query(
      collection(db, "notifications"),
      where("recipientUid", "==", currentUserUid),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        // Chime only for notifications that arrive while the page is open,
        // not for the ones already there when it loads.
        if (!firstSnapshot && soundOnRef.current) {
          const arrived = snap
            .docChanges()
            .some((c) => c.type === "added" && !c.doc.metadata.hasPendingWrites && !c.doc.data().read);
          if (arrived) playNotificationSound();
        }
        firstSnapshot = false;

        setNotifications(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              type: (data.type ?? "release-approved") as NotificationType,
              title: data.title ?? "Notification",
              message: data.message ?? "",
              read: data.read ?? false,
              createdAt: data.createdAt ?? null,
              metadata: (data.metadata as Record<string, unknown>) ?? {},
              resolution: (data.resolution as string) ?? null,
            };
          })
        );
      },
      (err) => console.warn("Notifications fetch failed:", err.code)
    );
    return () => unsubscribe();
  }, [currentUserUid]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const markAllRead = async () => {
    try {
      await markAllNotificationsAsRead(currentUserUid);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotificationSoundOn(next);
    if (next) {
      unlockNotificationSound();
      playNotificationSound(); // preview
    }
  };

  const resolve = (id: string, resolution: string) =>
    updateDoc(doc(db, "notifications", id), {
      read: true,
      readAt: serverTimestamp(),
      resolution,
      resolvedAt: serverTimestamp(),
    });

  /** Same checks and release as the Release Queue (lib/releaseFlow.ts). */
  const releaseFromNotification = async (n: NotificationRow) => {
    const violationId = String(n.metadata.violationId ?? "");
    if (!violationId || busyId) return;
    setBusyId(n.id);
    try {
      const outcome = await confirmAndRelease({
        violationId,
        officerName: officerName || "Release Officer",
      });
      if (outcome === "released" || outcome === "already-released") await resolve(n.id, "released");
      if (outcome === "missing") await resolve(n.id, "missing");
    } catch (err) {
      console.error("Release from notification failed:", err);
      alert((err as Error)?.message || "Failed to mark as released.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="notification-bell-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="nb-header">
            <span className="nb-header-title">Notifications</span>
            <div className="nb-header-actions">
              <button
                type="button"
                className="nb-icon-btn"
                onClick={toggleSound}
                title={soundOn ? "Sound on — click to mute" : "Sound off — click to turn on"}
                aria-label={soundOn ? "Mute notification sound" : "Turn on notification sound"}
              >
                {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              <button
                type="button"
                className="nb-text-btn"
                onClick={() => void markAllRead()}
                disabled={unreadCount === 0}
              >
                Mark all as read
              </button>
            </div>
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <Bell size={32} className="notification-empty-icon" />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className={`notification-item ${!n.read ? "unread" : ""}`}
                  onClick={() => void markAsRead(n.id)}
                >
                  <div
                    className={`notification-icon ${
                      n.type === "release-approved" ? "icon-approved" : "icon-denied"
                    }`}
                  >
                    {n.type === "release-approved" ? (
                      <CheckCircle2 size={22} strokeWidth={2.5} />
                    ) : (
                      <XCircle size={22} strokeWidth={2.5} />
                    )}
                  </div>
                  <div className="notification-content">
                    <p className="notification-item-title">{n.title}</p>
                    <p className="notification-item-message">{n.message}</p>
                    <p className="notification-item-time">{formatRelativeTime(n.createdAt)}</p>

                    {typeof n.metadata.mapUrl === "string" && (
                      <a
                        className="nb-map-link"
                        href={n.metadata.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View on map
                      </a>
                    )}

                    {canReleaseFrom(n) && (
                      <button
                        type="button"
                        className="nb-release-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void releaseFromNotification(n);
                        }}
                        disabled={busyId !== null}
                      >
                        {busyId === n.id ? (
                          <>
                            <Loader2 size={13} className="nb-spin" /> Releasing...
                          </>
                        ) : (
                          "Mark as Released"
                        )}
                      </button>
                    )}
                    {n.resolution === "released" && (
                      <span className="nb-released-chip">
                        <CheckCircle2 size={12} /> Released
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
