/* ------------------------------------------------------------------
   Enforcer sessions — para lumabas ang enforcer sa Session Monitor ng
   IT Admin (admin web), kasama ang device at IP address.

   - Pag-login: gumagawa ng sessions/{id} (uid, pangalan, role, device, IP).
   - Habang bukas ang app: ina-update ang lastActive kada 5 minuto, at
     tuwing babalik ang app sa harap (AppState "active").
   - Pag-logout: sinasara (active: false, endedAt).
   - Pagbukas ulit ng app sa loob ng shift (src/shift.js): itinutuloy ang
     parehong session (resumeSession), hindi gumagawa ng bago.
   - Kapag ni-Revoke ng IT Admin (revoked: true): tinatawag ang
     setRevokeHandler() callback (App.tsx), na naglo-logout at bumabalik
     sa Login.

   Ang IP ay galing sa admin web: https://mtpb-admin.vercel.app/api/client-ip
   (Vercel function). Kapag mobile data, IP ito ng network (Globe/Smart),
   hindi ng mismong phone.
------------------------------------------------------------------ */
import { AppState, Platform } from 'react-native';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { clearShift, readShift, setShiftSession } from './shift';

export const CLIENT_IP_URL = 'https://mtpb-admin.vercel.app/api/client-ip';
const HEARTBEAT_MS = 5 * 60 * 1000;

let sessionId = null;
let ip = '—';
let stopWatch = null;
let heartbeat = null;
let appStateSub = null;
let onRevoked = null;

/** App.tsx registers what to do when the IT Admin revokes the session. */
export function setRevokeHandler(handler) {
  onRevoked = handler;
}

/** The IP found at sign-in (for audit logs), or "—". */
export const clientIp = () => ip;

/** "Enforcer app · Samsung SM-A125F (Android 12)" */
export function describeDevice() {
  const c = Platform.constants || {};
  const brand = c.Brand ? String(c.Brand).charAt(0).toUpperCase() + String(c.Brand).slice(1) : '';
  const model = c.Model ? String(c.Model) : '';
  const phone = [brand, model].filter(Boolean).join(' ') || 'Phone';
  const os = Platform.OS === 'android' ? `Android ${c.Release ?? Platform.Version}` : `${Platform.OS} ${Platform.Version}`;
  return `Enforcer app · ${phone} (${os})`;
}

async function fetchClientIp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(CLIENT_IP_URL, { signal: controller.signal });
    if (!res.ok) return '—';
    const data = await res.json();
    const value = typeof data?.ip === 'string' ? data.ip.trim() : '';
    return /^[0-9a-fA-F:.]{3,45}$/.test(value) ? value : '—';
  } catch {
    return '—';
  } finally {
    clearTimeout(timer);
  }
}

function stopTimers() {
  stopWatch?.();
  stopWatch = null;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  appStateSub?.remove?.();
  appStateSub = null;
}

async function touch() {
  if (!sessionId) return;
  try {
    await updateDoc(doc(db, 'sessions', sessionId), { lastActive: serverTimestamp() });
  } catch {
    // revoked, offline, or signed out: nothing to refresh
  }
}

/** Revoke watch + lastActive heartbeat for the current session. */
function watchSession(id) {
  stopWatch = onSnapshot(
    doc(db, 'sessions', id),
    (snap) => {
      if (snap.exists() && snap.data()?.revoked === true) {
        stopTimers();
        sessionId = null;
        clearShift();
        onRevoked?.();
      }
    },
    () => {
      // can't read it (offline / rules): keep working
    },
  );
  heartbeat = setInterval(touch, HEARTBEAT_MS);
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') touch();
  });
}

/**
 * Starts the session after a successful login. Never throws: if it
 * can't be recorded (offline, rules), the app still works.
 */
export async function startSession({ uid, name }) {
  stopTimers();
  sessionId = null;
  try {
    ip = await fetchClientIp();
    const ref = await addDoc(collection(db, 'sessions'), {
      uid,
      userId: uid,
      userName: name || 'Enforcer',
      role: 'clamping-staff',
      device: describeDevice(),
      ipAddress: ip,
      loginTime: serverTimestamp(),
      lastActive: serverTimestamp(),
      active: true,
    });
    sessionId = ref.id;
    await setShiftSession(sessionId);
    watchSession(sessionId);
  } catch (err) {
    console.log('Session not recorded:', err?.code || err?.message);
  }
}

/**
 * The app was opened again during the shift: continue the session saved
 * at login instead of recording a new one.
 * Returns false when the IT Admin revoked it (the caller logs out).
 */
export async function resumeSession({ uid, name }) {
  stopTimers();
  sessionId = null;
  const saved = (await readShift())?.sessionId;
  if (!saved) {
    await startSession({ uid, name });
    return true;
  }
  try {
    const snap = await getDoc(doc(db, 'sessions', saved));
    const data = snap.exists() ? snap.data() : null;
    if (data?.revoked === true) {
      await clearShift();
      return false;
    }
    if (!data || data.active === false) {
      // gone or already closed: record a fresh one
      await startSession({ uid, name });
      return true;
    }
    ip = data.ipAddress || '—';
  } catch {
    // offline: keep the saved session, the watch catches up later
  }
  sessionId = saved;
  watchSession(saved);
  touch();
  return true;
}

/**
 * Closes the session and forgets the shift. Call before signOut().
 * `savedId` closes the one saved at login (shift over before the app
 * resumed it).
 */
export async function endSession(savedId = null) {
  const id = sessionId || savedId;
  stopTimers();
  sessionId = null;
  ip = '—';
  await clearShift();
  if (!id) return;
  try {
    await updateDoc(doc(db, 'sessions', id), { active: false, endedAt: serverTimestamp() });
  } catch {
    // already revoked or offline
  }
}
