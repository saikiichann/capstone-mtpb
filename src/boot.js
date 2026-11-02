/* ------------------------------------------------------------------
   App start — where the enforcer lands when the app opens.

   Signed in and still within the shift (src/shift.js) → Home, after
   checking that the account is still an active Clamping Staff and that
   the IT Admin hasn't revoked the session. Otherwise → Login.
------------------------------------------------------------------ */
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { SHIFT_HOURS, clearShift, readShift, shiftExpired } from './shift';
import { endSession, resumeSession } from './session';

export const LOGIN = { route: 'Login', params: undefined, notice: null };

/** Messages shown when the app sends the enforcer back to Login. */
export const NOTICES = {
  shift: [
    'Shift ended',
    `You stay logged in for one shift (${SHIFT_HOURS} hours). Please log in again.`,
  ],
  account: [
    'Account changed',
    'Your account is no longer active for the Clamping Team. Contact the IT Admin.',
  ],
  revoked: ['Session ended', 'Your session was ended by the IT Admin. Please log in again.'],
};

/** The sign-in Firebase restored from the phone (or null). */
export function waitForUser(timeoutMs = 8000) {
  return new Promise((resolve) => {
    let done = false;
    let unsub = null;
    const finish = (user) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsub?.();
      resolve(user ?? null);
    };
    const timer = setTimeout(() => finish(auth.currentUser), timeoutMs);
    unsub = onAuthStateChanged(auth, finish);
    if (done) unsub?.();
  });
}

async function logout(savedSessionId) {
  await endSession(savedSessionId);
  try {
    await signOut(auth);
  } catch {
    // signed out locally anyway
  }
}

/** Decides the first screen. Never throws. */
export async function decideStart(user) {
  try {
    if (!user) {
      await clearShift();
      return LOGIN;
    }
    const shift = await readShift();
    if (!shift || shift.uid !== user.uid) {
      await logout(shift?.sessionId);
      return LOGIN;
    }
    if (shiftExpired(shift)) {
      await logout(shift.sessionId);
      return { ...LOGIN, notice: 'shift' };
    }

    let name = shift.name || 'Officer';
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) {
        await logout(shift.sessionId);
        return { ...LOGIN, notice: 'account' };
      }
      const data = snap.data() || {};
      if (data.status !== 'active' || data.role !== 'clamping-staff') {
        await logout(shift.sessionId);
        return { ...LOGIN, notice: 'account' };
      }
      name = data.name || name;
    } catch {
      // offline: trust the saved shift; the app re-checks once online
    }

    const resumed = await resumeSession({ uid: user.uid, name });
    if (!resumed) {
      try {
        await signOut(auth);
      } catch {
        // signed out locally anyway
      }
      return { ...LOGIN, notice: 'revoked' };
    }
    return {
      route: 'ClampDashboard',
      params: { officerName: name, officerUid: user.uid },
      notice: null,
    };
  } catch {
    return LOGIN;
  }
}

/** While the app is open: is the signed-in enforcer past the shift? */
export async function shiftOver(now = Date.now()) {
  if (!auth.currentUser) return false;
  const shift = await readShift();
  // No shift yet = a login is still being saved; not "over".
  return !!shift && shiftExpired(shift, now);
}
