import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CalendarDays, Lock, Truck, Volume2, VolumeX, Wallet } from "lucide-react";
import type { ActivityKind } from "../lib/fieldActivity";
import { useStaffAlerts } from "../lib/staffAlerts";
import {
  isNotificationSoundOn,
  playNotificationSound,
  setNotificationSoundOn,
  unlockNotificationSound,
} from "../lib/notificationSound";
import "./ActivityBell.css";

/* ------------------------------------------------------------------
   ActivityBell — notifications in the top bar (AppTopbar).

   New clamps, impounds, operations and payments to verify, for the
   roles they concern (lib/staffAlerts.ts). Opening the bell marks them
   read; clicking one opens its page. Chimes when one arrives while the
   page is open (same sound and on/off switch as the Release Officer's
   bell).
------------------------------------------------------------------ */

const KIND_ICON: Record<ActivityKind, typeof Bell> = {
  clamp: Lock,
  impound: Truck,
  operation: CalendarDays,
  payment: Wallet,
  release: Bell,
};

const KIND_LABEL: Record<ActivityKind, string> = {
  clamp: "Clamped",
  impound: "Impounded",
  operation: "Operation",
  payment: "To verify",
  release: "Released",
};

const ago = (t: Date): string => {
  const mins = Math.floor((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
};

export default function ActivityBell() {
  const navigate = useNavigate();
  const { enabled, events, unread, bellReadAt, markBellRead, pathFor } = useStaffAlerts();
  const [open, setOpen] = useState(false);
  /** Read time when the bell was opened, so new ones stay highlighted while it's open. */
  const [readAtOpen, setReadAtOpen] = useState(0);
  const [soundOn, setSoundOn] = useState(isNotificationSoundOn);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  // Chime when the unread count goes up (not for what's there on page load).
  const lastUnread = useRef<number | null>(null);
  useEffect(() => {
    if (lastUnread.current !== null && unread > lastUnread.current && soundOn) {
      playNotificationSound();
    }
    lastUnread.current = unread;
  }, [unread, soundOn]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled) return null;

  const toggleOpen = () => {
    if (!open) {
      setReadAtOpen(bellReadAt);
      markBellRead();
    }
    setOpen(!open);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotificationSoundOn(next);
    if (next) {
      unlockNotificationSound();
      playNotificationSound();
    }
  };

  return (
    <div className="ab-wrap" ref={wrapRef}>
      <button
        type="button"
        className="ab-btn"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
      >
        <Bell size={19} />
        {unread > 0 && <span className="ab-count">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="ab-panel" role="dialog" aria-label="Notifications">
          <div className="ab-head">
            <span className="ab-title">Notifications</span>
            <button
              type="button"
              className="ab-icon-btn"
              onClick={toggleSound}
              title={soundOn ? "Sound on — click to mute" : "Sound off — click to turn on"}
              aria-label={soundOn ? "Mute notification sound" : "Turn on notification sound"}
            >
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          </div>

          {events.length === 0 ? (
            <div className="ab-empty">
              <Bell size={28} aria-hidden="true" />
              <p>No new activity in the last 7 days.</p>
            </div>
          ) : (
            <ul className="ab-list">
              {events.map((e) => {
                const Icon = KIND_ICON[e.kind];
                const isNew = e.time.getTime() > readAtOpen;
                const path = pathFor(e);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`ab-item${isNew ? " is-new" : ""}`}
                      onClick={() => {
                        setOpen(false);
                        if (path) navigate(path);
                      }}
                    >
                      <span className={`ab-kind ab-kind-${e.kind}`} aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span className="ab-text">
                        <span className="ab-item-title">{e.title}</span>
                        {e.detail && <span className="ab-item-detail">{e.detail}</span>}
                        <span className="ab-item-meta">
                          {KIND_LABEL[e.kind]} · {ago(e.time)}
                        </span>
                      </span>
                      {isNew && <span className="ab-dot" aria-label="New" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
