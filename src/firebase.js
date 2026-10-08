import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";        // ← IDAGDAG ITO

export const firebaseConfig = {
  apiKey: "AIzaSyAWVZFyL69T8JFloi0lb-9JSQGkftklnCQ",
  authDomain: "mtpb-integrated-enforcem-9e6f8.firebaseapp.com",
  projectId: "mtpb-integrated-enforcem-9e6f8",
  storageBucket: "mtpb-integrated-enforcem-9e6f8.firebasestorage.app",
  messagingSenderId: "193167402004",
  appId: "1:193167402004:web:db259e0839a88f6f91b301",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);                // ← IDAGDAG ITO