/* ------------------------------------------------------------------
   LIVE COLLECTIONS — one shared Firestore listener per collection.

   The notification bell (top bar), the sidebar badges and the Field
   Updates feed all need the same live collections (violations,
   impoundRecords, payments, …). Instead of each one opening its own
   listener on every page, they share one here. A listener stays open a
   minute after the last page using it closes, so moving between pages
   doesn't reload anything. Logging out / in starts them fresh.
------------------------------------------------------------------ */
import { useCallback, useSyncExternalStore } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { auth, db } from "../firebase";

export type LiveDoc = { id: string; data: DocumentData };

type Entry = {
  rows: LiveDoc[] | undefined;
  listeners: Set<() => void>;
  unsub: Unsubscribe | null;
  stopTimer: ReturnType<typeof setTimeout> | null;
};

const KEEP_OPEN_MS = 60_000;
const entries = new Map<string, Entry>();

const emit = (e: Entry) => e.listeners.forEach((l) => l());

function start(name: string, e: Entry) {
  if (e.unsub) return;
  e.unsub = onSnapshot(
    collection(db, name),
    (snap) => {
      e.rows = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
      emit(e);
    },
    (err) => {
      // e.g. no permission for this role: show nothing, don't retry until the next login.
      console.warn(`Live ${name} not loaded:`, err.code);
      e.unsub = null;
      e.rows = [];
      emit(e);
    }
  );
}

function stop(e: Entry) {
  e.unsub?.();
  e.unsub = null;
}

// A different account signs in (or signs out): drop the old data.
let authWatched = false;
let lastUid: string | null | undefined;
function watchAuth() {
  if (authWatched) return;
  authWatched = true;
  onAuthStateChanged(auth, (user) => {
    const uid = user?.uid ?? null;
    if (lastUid === undefined) {
      lastUid = uid;
      return;
    }
    if (uid === lastUid) return;
    lastUid = uid;
    entries.forEach((e, name) => {
      stop(e);
      e.rows = undefined;
      if (uid && e.listeners.size > 0) start(name, e);
      emit(e);
    });
  });
}

function entryOf(name: string): Entry {
  let e = entries.get(name);
  if (!e) {
    e = { rows: undefined, listeners: new Set(), unsub: null, stopTimer: null };
    entries.set(name, e);
  }
  return e;
}

/** Live documents of a collection (undefined while loading). `null` = don't load. */
export function useLiveCollection(name: string | null): LiveDoc[] | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!name) return () => {};
      watchAuth();
      const e = entryOf(name);
      e.listeners.add(onChange);
      if (e.stopTimer) {
        clearTimeout(e.stopTimer);
        e.stopTimer = null;
      }
      if (auth.currentUser) start(name, e);
      return () => {
        e.listeners.delete(onChange);
        if (e.listeners.size === 0) {
          e.stopTimer = setTimeout(() => {
            e.stopTimer = null;
            if (e.listeners.size === 0) {
              stop(e);
              e.rows = undefined;
            }
          }, KEEP_OPEN_MS);
        }
      };
    },
    [name]
  );
  const read = useCallback(() => (name ? entryOf(name).rows : undefined), [name]);
  return useSyncExternalStore(subscribe, read, read);
}
