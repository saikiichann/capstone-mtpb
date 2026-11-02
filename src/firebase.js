import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const firebaseConfig = {
  apiKey: "AIzaSyAWVZFyL69T8JFloi0lb-9JSQGkftklnCQ",
  authDomain: "mtpb-integrated-enforcem-9e6f8.firebaseapp.com",
  projectId: "mtpb-integrated-enforcem-9e6f8",
  storageBucket: "mtpb-integrated-enforcem-9e6f8.firebasestorage.app",
  messagingSenderId: "193167402004",
  appId: "1:193167402004:web:db259e0839a88f6f91b301",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
// Keep the sign-in on the phone, so the enforcer doesn't log in every
// time the app opens. How long the app accepts it (one 12-hour shift) is
// decided in src/shift.js.
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // already set up (Fast Refresh in development)
  authInstance = getAuth(app);
}
export const auth = authInstance;
