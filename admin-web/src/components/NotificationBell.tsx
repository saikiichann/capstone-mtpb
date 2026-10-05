import { useState, useEffect, useRef } from "react";
import { Bell, CheckCircle2, XCircle } from "lucide-react";
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

export type NotificationType = "release-approved" | "release-denied";

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Timestamp | null;
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

/**
 * In-app notifications para sa MTPB staff.
 *
 * Tandaan: staff-facing lang ito. Walang push notification sa violators —
 * naka-exclude yun sa Delimitations ng paper.
 */
export function NotificationBell({
  currentUserUid,
}: {
  currentUserUid: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUserUid) return;
    const q = query(
      collection(db, "notifications"),
      where("recipientUid", "==", currentUserUid),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
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
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
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
          <span className="notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
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
                  onClick={() => markAsRead(n.id)}
                >
                  <div
                    className={`notification-icon ${
                      n.type === "release-approved"
                        ? "icon-approved"
                        : "icon-denied"
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
                    <p className="notification-item-time">
                      {formatRelativeTime(n.createdAt)}
                    </p>
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