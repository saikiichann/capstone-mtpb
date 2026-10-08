import { signInWithEmailAndPassword, onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

/**
 * Signs in with email/password, then checks the user's role from their
 * Firestore profile (users/{uid}.team) instead of guessing from the email text.
 * Expects a Firestore document shaped like:
 *   users/{uid}: { team: 'clamp' | 'impound', name: 'Juan Dela Cruz', enforcerId: '00000' }
 */
export async function signIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const uid = credential.user.uid;

  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) {
    throw new Error('No profile found for this account. Ask an admin to set up your account.');
  }

  const profile = userSnap.data();
  if (profile.team !== 'clamp') {
    throw new Error('This account is not registered to the Clamping Team.');
  }

  return { uid, ...profile };
}

export function signOut() {
  return fbSignOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}