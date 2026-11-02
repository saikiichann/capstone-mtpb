/* ------------------------------------------------------------------
   Shift login — the enforcer stays logged in for one shift.

   - Login saves { uid, name, loginAt } on the phone (AsyncStorage).
   - Opening the app again within SHIFT_HOURS goes straight to Home.
   - After SHIFT_HOURS the app logs out by itself (App.tsx), so a phone
     left behind or lost doesn't stay logged in for days.
   - Logout and an IT Admin revoke clear it (src/session.js).

   Firebase keeps the sign-in itself (src/firebase.js); this file only
   decides how long the app accepts it.
------------------------------------------------------------------ */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** One duty shift. Change here if MTPB shifts are shorter/longer. */
export const SHIFT_HOURS = 12;
const SHIFT_MS = SHIFT_HOURS * 60 * 60 * 1000;
const KEY = 'mtpb-enforcer-shift';

/** { uid, name, loginAt, sessionId } or null. Never throws. */
export async function readShift() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

async function writeShift(data) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage unavailable: the user just logs in again next time
  }
}

/** A new login starts a new shift. */
export async function startShift({ uid, name }, now = Date.now()) {
  await writeShift({ uid, name: name || '', loginAt: now, sessionId: null });
}

/** Remembers the Session Monitor record, so reopening the app reuses it. */
export async function setShiftSession(sessionId) {
  const shift = await readShift();
  if (!shift) return;
  await writeShift({ ...shift, sessionId: sessionId || null });
}

/** Logout / revoke / shift over. */
export async function clearShift() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // nothing saved
  }
}

/** True when there is no shift or it is older than SHIFT_HOURS. */
export function shiftExpired(shift, now = Date.now()) {
  const at = Number(shift?.loginAt);
  if (!Number.isFinite(at) || at <= 0) return true;
  return now - at >= SHIFT_MS;
}
