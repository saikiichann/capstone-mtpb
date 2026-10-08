import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyATxkisFA1ADTDMJr2IQI_RBbGtBe68uYo',
  authDomain: 'enforcermobileapp-test.firebaseapp.com',
  projectId: 'enforcermobileapp-test',
  storageBucket: 'enforcermobileapp-test.firebasestorage.app',
  messagingSenderId: '867534961212',
  appId: '1:867534961212:web:2a191cc5f79dadcf7ee139',
};

const app = initializeApp(firebaseConfig);

// getReactNativePersistence para nananatiling naka-login ang user
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);
export const storage = getStorage(app);