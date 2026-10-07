import { onAuthStateChanged } from 'firebase/auth'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sampleUser } from '../data/sample'
import { auth, isFirebaseConfigured } from '../firebase/config'
import {
  getViolatorProfile,
  resendVerificationEmail,
  saveViolatorProfile,
  signInAsGuest,
  sendResetEmail,
  signInViolator,
  signOutUser,
  signUpViolator,
} from '../firebase/auth'
import { AuthContext } from './auth-context'

// Reading a violation signs the scanner in anonymously, because the shared
// project only lets signed-in users read violations and clamps. That makes
// everyone look like a guest — so "is anonymous" can't mean "chose to pay as
// a guest". This flag records the actual choice, and is kept for the tab so
// it survives the trip out to PayMongo and back.
const GUEST_CHOICE_KEY = 'mtpb-guest-checkout'

function readGuestChoice() {
  try {
    return sessionStorage.getItem(GUEST_CHOICE_KEY) === '1'
  } catch {
    return false
  }
}

function writeGuestChoice(chosen) {
  try {
    if (chosen) sessionStorage.setItem(GUEST_CHOICE_KEY, '1')
    else sessionStorage.removeItem(GUEST_CHOICE_KEY)
  } catch {
    // Private mode: the choice just won't survive a reload.
  }
}

// A plain snapshot of the Firebase user, so React re-renders when
// emailVerified changes after user.reload().
function snapshotUser(user) {
  if (!user) return null
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    isGuest: Boolean(user.isAnonymous),
  }
}

export default function AuthProvider({ children }) {
  return isFirebaseConfigured ? (
    <FirebaseAuthProvider>{children}</FirebaseAuthProvider>
  ) : (
    <DemoAuthProvider>{children}</DemoAuthProvider>
  )
}

function FirebaseAuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, profile: null })
  const [guestChose, setGuestChose] = useState(readGuestChoice)
  // While signIn/signUp are running they set the state themselves, so the
  // listener must not sign the user out before their document exists.
  const busyRef = useRef(false)

  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (busyRef.current) return
      if (!fbUser) {
        setState({ status: 'ready', user: null, profile: null })
        return
      }
      // Guests (anonymous sign-in) have no violator document on purpose.
      if (fbUser.isAnonymous) {
        setState({ status: 'ready', user: snapshotUser(fbUser), profile: null })
        return
      }
      try {
        const profile = await getViolatorProfile(fbUser.uid)
        if (!profile) {
          await signOutUser()
          return
        }
        setState({ status: 'ready', user: snapshotUser(fbUser), profile })
      } catch (err) {
        console.error('Could not load violator profile', err)
        await signOutUser()
      }
    })
  }, [])

  const signIn = useCallback(async (credentials) => {
    busyRef.current = true
    try {
      const { user, profile } = await signInViolator(credentials)
      setState({ status: 'ready', user: snapshotUser(user), profile })
    } finally {
      busyRef.current = false
    }
  }, [])

  const signUp = useCallback(async (details) => {
    busyRef.current = true
    try {
      const { user, profile } = await signUpViolator(details)
      setState({ status: 'ready', user: snapshotUser(user), profile })
    } finally {
      busyRef.current = false
    }
  }, [])

  const signOut = useCallback(() => {
    writeGuestChoice(false)
    setGuestChose(false)
    return signOutUser()
  }, [])

  // Pay-as-guest: no form, no email — just a token the backend can check.
  // This is the deliberate choice, so it's what unlocks paying.
  const continueAsGuest = useCallback(async () => {
    busyRef.current = true
    try {
      const { user } = await signInAsGuest()
      writeGuestChoice(true)
      setGuestChose(true)
      setState({ status: 'ready', user: snapshotUser(user), profile: null })
    } finally {
      busyRef.current = false
    }
  }, [])

  // Re-checks emailVerified after the user clicks the link in their email.
  const refreshUser = useCallback(async () => {
    const current = auth.currentUser
    if (!current) return false
    await current.reload()
    if (current.emailVerified) await current.getIdToken(true)
    setState((prev) => ({ ...prev, user: snapshotUser(auth.currentUser) }))
    return current.emailVerified
  }, [])

  // Saves Profile edits and shows them right away.
  const updateProfile = useCallback(async (changes) => {
    const uid = auth.currentUser?.uid
    if (!uid) throw new Error('Not signed in')
    await saveViolatorProfile(uid, changes)
    setState((prev) => ({ ...prev, profile: { ...prev.profile, ...changes } }))
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      isDemo: false,
      // True only once someone has tapped "Pay now as guest". Anonymous
      // sign-in alone doesn't count — see GUEST_CHOICE_KEY above.
      guestChoseCheckout: guestChose,
      updateProfile,
      continueAsGuest,
      signIn,
      signUp,
      signOut,
      refreshUser,
      resendVerification: resendVerificationEmail,
      sendPasswordReset: sendResetEmail,
    }),
    [state, guestChose, signIn, signUp, signOut, refreshUser, updateProfile, continueAsGuest],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ---------------------------------------------------------------------------
// Demo mode: used while .env.local has no Firebase keys. Any email and
// password work, so the screens can be clicked through without a backend.
// The session is kept in sessionStorage so a page refresh keeps you logged in.

const DEMO_KEY = 'mtpb-demo-session'

function readDemoSession() {
  try {
    const raw = sessionStorage.getItem(DEMO_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeDemoSession(session) {
  try {
    if (session) sessionStorage.setItem(DEMO_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(DEMO_KEY)
  } catch {
    // Storage can be unavailable (private mode); the session just won't persist.
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function DemoAuthProvider({ children }) {
  const [session, setSession] = useState(readDemoSession)

  const update = useCallback((next) => {
    writeDemoSession(next)
    setSession(next)
  }, [])

  const value = useMemo(
    () => ({
      status: 'ready',
      user: session?.user ?? null,
      profile: session?.profile ?? null,
      isDemo: true,
      // Demo mode never signs anyone in just to read, so any guest here
      // reached that state by choosing to pay as one.
      guestChoseCheckout: Boolean(session?.user?.isGuest),
      signIn: async ({ email }) => {
        await wait(500)
        update({
          user: { uid: 'demo', email, emailVerified: true, displayName: sampleUser.fullName },
          profile: { uid: 'demo', full_name: sampleUser.fullName, email },
        })
      },
      signUp: async ({ fullName, email, mobileNumber }) => {
        await wait(700)
        // A guest who signs up keeps the same uid, like Firebase linking.
        const uid = session?.user?.isGuest ? session.user.uid : 'demo'
        update({
          user: { uid, email, emailVerified: false, displayName: fullName },
          profile: { uid, full_name: fullName, email, mobile_number: mobileNumber },
        })
      },
      signOut: async () => update(null),
      continueAsGuest: async () => {
        await wait(300)
        update({
          user: { uid: 'guest', email: '', emailVerified: false, displayName: '', isGuest: true },
          profile: null,
        })
      },
      updateProfile: async (changes) => {
        await wait(300)
        update({ ...session, profile: { ...session.profile, ...changes } })
      },
      refreshUser: async () => Boolean(session?.user?.emailVerified),
      resendVerification: () => wait(400),
      sendPasswordReset: () => wait(400),
      markVerifiedDemo: () =>
        update({ ...session, user: { ...session.user, emailVerified: true } }),
    }),
    [session, update],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
