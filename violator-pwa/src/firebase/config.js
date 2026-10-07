import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Values come from .env.local (see .env.example). Vite only exposes
// vars prefixed with VITE_ to client code.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Firebase Auth throws "auth/invalid-api-key" as soon as it initializes
// without a key, which would crash the whole app. So we only start Firebase
// when the config is filled in; otherwise the app runs on sample data.
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
)

export const shouldUseSampleData =
  import.meta.env.VITE_USE_SAMPLE_DATA === 'true' || !isFirebaseConfigured

export const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
// No Firebase Storage: photos and documents live in Supabase (see
// INTEGRATION.md), so Firestore only ever holds their URLs.
