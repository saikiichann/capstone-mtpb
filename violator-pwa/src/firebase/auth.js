import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  linkWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db } from './config'
import { COLLECTIONS, VIOLATOR_ROLE_ID } from './schema'

// Thrown when someone signs in with an account that has no violator
// document (for example an MTPB staff account from the admin side).
export class NotViolatorError extends Error {
  constructor() {
    super('This account is not registered as a vehicle owner.')
    this.code = 'app/not-violator'
  }
}

// When the verification email can't be sent, signing up still succeeds — the
// account exists and the link can be resent. But the Verify Email screen has
// to say so, or someone sits there waiting for a mail that was never sent.
// The reason is left here for that screen to pick up after the redirect.
const VERIFY_ERROR_KEY = 'mtpb-verify-send-error'

export function noteVerificationProblem(code) {
  try {
    if (code) sessionStorage.setItem(VERIFY_ERROR_KEY, code)
    else sessionStorage.removeItem(VERIFY_ERROR_KEY)
  } catch {
    // Private mode: the screen just won't explain the silence.
  }
}

export function takeVerificationProblem() {
  try {
    const code = sessionStorage.getItem(VERIFY_ERROR_KEY)
    sessionStorage.removeItem(VERIFY_ERROR_KEY)
    return code
  } catch {
    return null
  }
}

function verificationSettings() {
  // Brings the user back to the app after they click the link.
  // The domain must be listed under Authentication > Settings >
  // Authorized domains (localhost is there by default).
  return { url: `${window.location.origin}/verify-email` }
}

export async function getViolatorProfile(uid) {
  const snapshot = await getDoc(doc(db, COLLECTIONS.violators, uid))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

// Guest mode: someone who scanned the clamp's QR code and wants to pay
// without making an account. Firebase signs them in anonymously, which gives
// the backend a real token to check while they type nothing.
export function signInAsGuest() {
  return signInAnonymously(auth)
}

// The shared project's rules allow reads of violations and clamps to any
// SIGNED-IN user rather than to the public. Someone who has just scanned a QR
// code isn't signed in at all, so this signs them in anonymously first —
// which is enough for those rules, and avoids asking the admin side to open
// its data to the whole internet.
//
// Needs Anonymous sign-in enabled in the Firebase console. If it isn't, the
// read is attempted anyway so the failure says "permission denied" rather
// than something about sign-in.
export async function ensureSignedIn() {
  if (!auth || auth.currentUser) return auth?.currentUser ?? null
  try {
    const { user } = await signInAnonymously(auth)
    return user
  } catch (error) {
    console.warn('Could not sign in anonymously to read public records', error)
    return null
  }
}

export async function signUpViolator({ fullName, email, mobileNumber, password }) {
  // A guest who signs up keeps the same uid, so the payment they just made
  // stays theirs.
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null
  const { user } = guest
    ? await linkWithCredential(guest, EmailAuthProvider.credential(email, password))
    : await createUserWithEmailAndPassword(auth, email, password)

  const profile = {
    uid: user.uid,
    full_name: fullName,
    email,
    role_id: VIOLATOR_ROLE_ID,
    orcr_url: null,
    // Not in the manuscript's field list yet. The Sign Up screen asks for it.
    mobile_number: mobileNumber,
    created_at: serverTimestamp(),
  }

  try {
    await setDoc(doc(db, COLLECTIONS.violators, user.uid), profile)
  } catch (err) {
    // Don't leave an Auth account behind without its violator document.
    // (A guest that was just upgraded is deleted too; they can sign up again.)
    await deleteUser(user).catch(() => {})
    throw err
  }

  await updateProfile(user, { displayName: fullName }).catch(() => {})

  noteVerificationProblem(null)
  await sendEmailVerification(user, verificationSettings()).catch((err) => {
    // The account exists, so don't fail the sign-up — but record why the
    // email didn't go, so the Verify Email screen can say something useful
    // instead of leaving the person staring at an empty inbox.
    console.warn('Could not send verification email', err)
    noteVerificationProblem(err?.code || 'unknown')
  })

  return { user, profile }
}

// Saves edits from the Profile screens. The role and uid can't change
// (the security rules refuse that anyway).
export async function saveViolatorProfile(uid, changes) {
  await updateDoc(doc(db, COLLECTIONS.violators, uid), { ...changes, updated_at: serverTimestamp() })
  return changes
}

export async function signInViolator({ email, password }) {
  const { user } = await signInWithEmailAndPassword(auth, email, password)
  let profile
  try {
    profile = await getViolatorProfile(user.uid)
  } catch (err) {
    await signOut(auth)
    throw err
  }
  if (!profile) {
    await signOut(auth)
    throw new NotViolatorError()
  }
  return { user, profile }
}

export function signOutUser() {
  return signOut(auth)
}

export function resendVerificationEmail() {
  return sendEmailVerification(auth.currentUser, verificationSettings())
}

export function sendResetEmail(email) {
  return sendPasswordResetEmail(auth, email)
}

// Turns Firebase error codes into messages a vehicle owner can act on.
export function authErrorMessage(err) {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try logging in instead.'
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 8 characters).'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.'
    case 'auth/network-request-failed':
      return 'No internet connection. Check your connection and try again.'
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is turned off for this Firebase project.'
    case 'auth/unauthorized-continue-uri':
    case 'auth/unauthorized-domain':
      return 'This website address is not in the Firebase project’s authorized domains.'
    case 'permission-denied':
      return 'The app was not allowed to read or save your account details. Check the Firestore security rules.'
    case 'app/not-violator':
      return 'This account is not registered as a vehicle owner. Staff accounts can’t sign in here.'
    default:
      // Naming the code turns "it doesn't work" into something searchable —
      // for the team now, and for whoever maintains this later.
      return err?.code
        ? `Something went wrong (${err.code}). Please try again.`
        : 'Something went wrong. Please try again.'
  }
}
