import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const COLLECTION = 'clampViolations';

/**
 * Creates a new clamp violation record directly in Firestore.
 */
export async function createViolation({
  clampCode,
  location,
  plate,
  make,
  type,
  color,
  violations,
  penalty,
  photoLocalUri,
  enforcerId,
}) {
  const violationNo = clampCode || `CL-${Date.now().toString().slice(-6)}`;

  // Format array/string violations cleanly
  const formattedViolations = Array.isArray(violations)
    ? violations
    : [violations || 'Clamping Violation'];
  const violationText = formattedViolations.join(', ');

  const record = {
    id: violationNo,
    clampCode: clampCode || violationNo,
    location: location || '',
    plate: plate || '',
    make: make || '',
    type: type || '',
    color: color || '',
    violation: violationText,
    violations: formattedViolations,
    amount: Number(penalty) || 0,
    penalty: Number(penalty) || 0,
    status: 'CLAMPED',
    paymentStatus: 'UNSETTLED',
    photoUrl: photoLocalUri || '',
    photoUri: photoLocalUri || '',
    enforcerId: enforcerId || '000000',
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, COLLECTION, violationNo), record);
  return record;
}

/**
 * Real-time listener para sa buong Activity Screen list.
 */
export function listenToViolations(onData) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const records = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          // Fallback date para hindi mag-null sa local state habang mina-map ni Firebase ang serverTimestamp
          createdAt: data.createdAt || new Date(),
        };
      });
      onData(records);
    },
    (error) => {
      console.error('Error listening to all violations:', error);
    }
  );
}

/**
 * Real-time listener para sa Recent Activity (Dashboard / Home Screen).
 * Inalisan ng complex 'where' filters para hindi maghanap ng Firestore Composite Index.
 */
export function listenToRecentActivity(onData, maxCount = 5) {
  const q = query(
    collection(db, COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(maxCount)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const records = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt || new Date(),
        };
      });
      onData(records);
    },
    (error) => {
      console.error('Error listening to recent activity:', error);
    }
  );
}