/* Mocks for native modules, so screens can render in Jest (no phone). */
jest.mock('react-native-vector-icons/Feather', () => 'Icon');
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MCIcon');
jest.mock('react-native-camera-kit', () => ({ Camera: 'Camera', CameraType: { Back: 'back' } }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///stamped.jpg') }));
jest.mock('react-native-print', () => ({ print: jest.fn() }));
jest.mock('@react-native-community/geolocation', () => ({
  setRNConfiguration: jest.fn(),
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
}));
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('./src/supabase', () => ({
  supabase: {},
  SUPABASE_BUCKET: 'violation-photos',
  uploadViolationPhoto: jest.fn(async () => 'https://example.test/photo.jpg'),
}));
jest.mock('./src/firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
      setItem: jest.fn(async (k, v) => {
        store.set(k, String(v));
      }),
      removeItem: jest.fn(async (k) => {
        store.delete(k);
      }),
      __store: store,
    },
  };
});
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, cb) => {
    cb(null);
    return () => {};
  }),
  initializeAuth: jest.fn(() => ({})),
  getAuth: jest.fn(() => ({})),
  getReactNativePersistence: jest.fn(() => ({})),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updatePassword: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  EmailAuthProvider: { credential: jest.fn() },
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(() => ({})),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDoc: jest.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocs: jest.fn(async () => ({ empty: true, docs: [] })),
  onSnapshot: jest.fn(() => () => {}),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  addDoc: jest.fn(),
  Timestamp: { fromDate: (d) => ({ toDate: () => d, toMillis: () => d.getTime() }), now: () => ({ toMillis: () => Date.now() }) },
}));
