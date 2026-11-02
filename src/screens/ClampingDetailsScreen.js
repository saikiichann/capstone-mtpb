import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import Dropdown from '../components/Dropdown';
import { ui } from '../theme/ui';
import { db } from '../firebase';
import { clientIp } from '../session';
import { uploadViolationPhoto } from '../supabase';
import Geolocation from '@react-native-community/geolocation';
import EvidencePhoto from '../components/EvidencePhoto';
import {
  formatAddress,
  isInDistrict3,
  reverseGeocode,
} from '../utils/geocode';
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================
const GRACE_PERIOD_HOURS = 24;

// ============================================================================
// SECTOR 3, MANILA (DISTRICT 3) — REAL LOCATIONS WITH COORDINATES
// ============================================================================
const LOCATIONS = [
  { name: 'Sampaloc - España Boulevard', lat: 14.6095, lng: 120.9890, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - Lacson Avenue', lat: 14.6118, lng: 120.9937, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - Earnshaw Street', lat: 14.6082, lng: 120.9856, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - Dapitan Street', lat: 14.6132, lng: 120.9876, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - P. Noval Street', lat: 14.6108, lng: 120.9895, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - A.H. Lacson Avenue', lat: 14.6118, lng: 120.9937, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - Legarda Street', lat: 14.6003, lng: 120.9925, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - Recto Avenue', lat: 14.6042, lng: 120.9889, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Santa Cruz - Rizal Avenue', lat: 14.6172, lng: 120.9818, barangay: 'Sta. Cruz', sectorId: 'sector-3' },
  { name: 'Santa Cruz - Blumentritt Road', lat: 14.6229, lng: 120.9845, barangay: 'Sta. Cruz', sectorId: 'sector-3' },
  { name: 'Santa Cruz - Oroquieta Street', lat: 14.6104, lng: 120.9829, barangay: 'Sta. Cruz', sectorId: 'sector-3' },
  { name: 'Santa Cruz - Tayuman Street', lat: 14.6180, lng: 120.9828, barangay: 'Sta. Cruz', sectorId: 'sector-3' },
  { name: 'Santa Cruz - Bambang Street', lat: 14.6118, lng: 120.9819, barangay: 'Sta. Cruz', sectorId: 'sector-3' },
  { name: 'Santa Cruz - Fugoso Street', lat: 14.6106, lng: 120.9832, barangay: 'Sta. Cruz', sectorId: 'sector-3' },
  { name: 'Quiapo - Quezon Boulevard', lat: 14.5987, lng: 120.9853, barangay: 'Quiapo', sectorId: 'sector-3' },
  { name: 'Quiapo - Hidalgo Street', lat: 14.5964, lng: 120.9865, barangay: 'Quiapo', sectorId: 'sector-3' },
  { name: 'Quiapo - Villalobos Street', lat: 14.5977, lng: 120.9852, barangay: 'Quiapo', sectorId: 'sector-3' },
  { name: 'Quiapo - Palanca Street', lat: 14.5971, lng: 120.9842, barangay: 'Quiapo', sectorId: 'sector-3' },
  { name: 'Quiapo - Evangelista Street', lat: 14.5965, lng: 120.9848, barangay: 'Quiapo', sectorId: 'sector-3' },
  { name: 'San Miguel - Ayala Bridge', lat: 14.5921, lng: 120.9898, barangay: 'San Miguel', sectorId: 'sector-3' },
  { name: 'San Miguel - Malacañang Area', lat: 14.5941, lng: 120.9947, barangay: 'San Miguel', sectorId: 'sector-3' },
  { name: 'San Miguel - Nepomuceno Street', lat: 14.5952, lng: 120.9935, barangay: 'San Miguel', sectorId: 'sector-3' },
];

const MAKES = ['Honda', 'Toyota', 'Mitsubishi', 'Nissan', 'Hyundai', 'Ford', 'Suzuki', 'Isuzu', 'Kia', 'Mazda'];
const TYPES = ['Sedan', 'SUV', 'Hatchback', 'Van', 'Pickup', 'Motorcycle', 'Truck', 'AUV', 'MPV'];
const COLORS = ['Black', 'White', 'Silver', 'Gray', 'Red', 'Blue', 'Green', 'Yellow', 'Brown', 'Orange'];

// ============================================================================
// HELPERS
// ============================================================================
function extractScanToken(scanned) {
  if (!scanned) return null;
  try {
    const url = new URL(scanned);
    const t = url.searchParams.get('t');
    if (t) return t;
  } catch (e) {
    // Not a URL — treat as raw token
  }
  return scanned.trim();
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestLocation(lat, lng) {
  let nearest = null;
  let minDistance = Infinity;
  LOCATIONS.forEach((loc) => {
    const distance = getDistanceFromLatLonInKm(lat, lng, loc.lat, loc.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = { ...loc, distance };
    }
  });
  return nearest;
}

function deriveBarangay(locationString) {
  if (!locationString) return null;
  const lower = locationString.toLowerCase();
  if (lower.includes('sampaloc')) return 'Sampaloc';
  if (lower.includes('santa cruz') || lower.includes('sta. cruz') || lower.includes('sta cruz')) return 'Sta. Cruz';
  if (lower.includes('quiapo')) return 'Quiapo';
  if (lower.includes('san miguel')) return 'San Miguel';
  if (lower.includes('binondo')) return 'Binondo';
  if (lower.includes('san nicolas')) return 'San Nicolas';
  if (lower.includes('ermita')) return 'Ermita';
  if (lower.includes('malate')) return 'Malate';
  if (lower.includes('intramuros')) return 'Intramuros';
  if (lower.includes('tondo')) return 'Tondo';
  if (lower.includes('paco')) return 'Paco';
  if (lower.includes('pandacan')) return 'Pandacan';
  if (lower.includes('santa ana') || lower.includes('sta. ana') || lower.includes('sta ana')) return 'Sta. Ana';
  if (lower.includes('santa mesa') || lower.includes('sta. mesa') || lower.includes('sta mesa')) return 'Sta. Mesa';
  if (lower.includes('san andres')) return 'San Andres';
  return null;
}

export default function ClampingDetailsScreen({ navigation, route }) {
  // ==========================================================================
  // 1. ALL HOOKS
  // ==========================================================================

  const rawScan = route?.params?.clampCode || '';
  // "Type clamp ID instead" on the scan screen (damaged QR sticker).
  const typedClampId = route?.params?.clampIdTyped || '';
  const photoUri = route?.params?.photoUri;
  const officerName = route?.params?.officerName || 'Unknown Officer';
  const officerUid = route?.params?.officerUid || null;

  const [locationObj, setLocationObj] = useState(LOCATIONS[0]);
  const [location, setLocation] = useState(LOCATIONS[0].name);
  const [plate, setPlate] = useState('');
  const [make, setMake] = useState('Honda');
  const [type, setType] = useState('Sedan');
  const [color, setColor] = useState('Black');
  const [selected, setSelected] = useState([]);
  const [issuing, setIssuing] = useState(false);
  // Every violation from this app is a clamp (no "ticket only" anymore).
  const enforcementType = 'clamped';

  // GPS STATE
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [gpsDetected, setGpsDetected] = useState(false);
  const [nearestLocation, setNearestLocation] = useState(null);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsRetryCount, setGpsRetryCount] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  // EXACT ADDRESS (OpenStreetMap, like the Marki app) — src/utils/geocode.js
  const [address, setAddress] = useState(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState('');
  const lastLookup = useRef(null);

  // EVIDENCE PHOTO WITH LOCATION STAMP (react-native-view-shot)
  const [photoTakenAt, setPhotoTakenAt] = useState(null);

  const [clampData, setClampData] = useState(null);
  const [clampLoading, setClampLoading] = useState(true);
  const [clampError, setClampError] = useState('');

  const [violationFines, setViolationFines] = useState({});
  const [finesLoading, setFinesLoading] = useState(true);

  // ==========================================================================
  // GPS AUTO-DETECT FUNCTION WITH RETRY
  // ==========================================================================
  // GPS → street, barangay, district. Once per new spot (free OSM server: max 1 request/second).
  const lookupAddress = async (lat, lng) => {
    const prev = lastLookup.current;
    if (prev && Math.abs(prev.lat - lat) < 0.0002 && Math.abs(prev.lng - lng) < 0.0002) return;
    lastLookup.current = { lat, lng };
    setAddressLoading(true);
    setAddressError('');
    try {
      setAddress(await reverseGeocode(lat, lng));
    } catch (err) {
      console.log('Address lookup failed:', err?.message);
      setAddress(null);
      setAddressError('Exact address unavailable (check internet). The selected location will be used.');
      lastLookup.current = null;
    } finally {
      setAddressLoading(false);
    }
  };

  const detectLocation = (retryCount = 0) => {
    setGpsLoading(true);
    setGpsError('');
    setGpsRetryCount(retryCount);

    if (Platform.OS === 'android') {
      Geolocation.setRNConfiguration({
        skipPermissionRequests: false,
        authorizationLevel: 'whenInUse',
        locationProvider: 'auto',
      });
    }

    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log('GPS detected:', latitude, longitude);
        setGpsCoords({ lat: latitude, lng: longitude });
        setGpsAccuracy(
          Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null
        );
        lookupAddress(latitude, longitude);

        const nearest = findNearestLocation(latitude, longitude);
        console.log('Nearest location:', nearest);

        if (nearest && nearest.distance < 0.5) {
          setLocation(nearest.name);
          setLocationObj({ lat: latitude, lng: longitude });
          setNearestLocation(nearest);
          setGpsDetected(true);
          setGpsError('');
        } else if (nearest && nearest.distance < 5) {
          setNearestLocation(nearest);
          setGpsDetected(false);
          setGpsError('');
        } else {
          setGpsError('Not near any registered location. Please select manually.');
          setGpsDetected(false);
        }
        setGpsLoading(false);
        setGpsRetryCount(0);
      },
      (error) => {
        console.log('GPS detection failed:', error);

        if (error.code === 3 && retryCount < 2) {
          console.log(`GPS timeout — retrying (${retryCount + 1}/2)...`);
          setGpsError(`GPS signal weak. Retrying (${retryCount + 1}/2)...`);
          setTimeout(() => {
            detectLocation(retryCount + 1);
          }, 2000);
          return;
        }

        let errorMessage = 'GPS detection failed.';
        switch (error.code) {
          case 1:
            errorMessage = 'GPS permission denied. Please enable location access.';
            break;
          case 2:
            errorMessage = 'GPS position unavailable. Check location settings.';
            break;
          case 3:
            errorMessage = 'GPS signal weak. Please go outdoors or select manually.';
            break;
          default:
            errorMessage = 'GPS detection failed. Please select manually.';
        }
        setGpsError(errorMessage);
        setGpsLoading(false);
        setGpsRetryCount(0);
      },
      {
        // Street-level needs high accuracy; the retries fall back to network location.
        enableHighAccuracy: retryCount === 0,
        timeout: retryCount === 0 ? 20000 : 30000,
        maximumAge: 60000,
      }
    );
  };

  // ==========================================================================
  // EFFECT 0: GPS auto-detect on mount
  // ==========================================================================
  useEffect(() => {
    detectLocation();
    // Run once when the screen opens; "Refresh GPS" calls it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New photo: remember when it was taken (shown on the location stamp).
  useEffect(() => {
    if (!photoUri) return;
    setPhotoTakenAt(new Date());
  }, [photoUri]);

  // ==========================================================================
  // EFFECT 1: Fetch clamp data based on scanned token
  // ==========================================================================
  useEffect(() => {
    if (!rawScan && !typedClampId) {
      setClampError('No QR code data received.');
      setClampLoading(false);
      return;
    }

    const fetchClamp = async () => {
      try {
        let clampSnap;
        if (typedClampId) {
          clampSnap = await getDocs(
            query(collection(db, 'clamps'), where('clampId', '==', typedClampId))
          );
          if (clampSnap.empty) {
            throw new Error(`No clamp with ID ${typedClampId}. Check the number on the clamp.`);
          }
        } else {
          const scanToken = extractScanToken(rawScan);
          if (!scanToken) {
            throw new Error('Could not read a valid token from the scanned QR code.');
          }
          clampSnap = await getDocs(
            query(collection(db, 'clamps'), where('scanToken', '==', scanToken))
          );
          if (clampSnap.empty) {
            throw new Error('No clamp found for this QR code. It may not be registered yet.');
          }
        }

        const clampDoc = clampSnap.docs[0];
        const data = clampDoc.data();

        if (data.cin || data.currentViolationId || data.deployedAt) {
          throw new Error(
            `This clamp (${data.clampId ?? clampDoc.id}) is already in use on another vehicle.`
          );
        }

        setClampData({
          docId: clampDoc.id,
          clampId: data.clampId ?? clampDoc.id,
          clampType: data.clampType ?? 'Car',
          scanToken: data.scanToken,
        });
        setClampLoading(false);
      } catch (err) {
        console.log('Failed to load clamp:', err);
        setClampError(err.message || 'Failed to load clamp data.');
        setClampLoading(false);
      }
    };

    fetchClamp();
  }, [rawScan, typedClampId]);

  // ==========================================================================
  // EFFECT 2: Fetch clamping fines from Firestore
  // ==========================================================================
  useEffect(() => {
    const q = query(collection(db, 'clampingFines'), orderBy('order', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fines = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.violationType) {
            fines[data.violationType] = Number(data.amount ?? 0);
          }
        });
        console.log('Loaded clampingFines:', fines);
        setViolationFines(fines);
        setFinesLoading(false);
      },
      (err) => {
        console.log('Failed to load clamping fines:', err);
        const fallbackQ = query(collection(db, 'clampingFines'));
        onSnapshot(fallbackQ, (snap) => {
          const fines = {};
          snap.docs.forEach((d) => {
            const data = d.data();
            if (data.violationType) {
              fines[data.violationType] = Number(data.amount ?? 0);
            }
          });
          setViolationFines(fines);
          setFinesLoading(false);
        });
      }
    );
    return () => unsubscribe();
  }, []);

  // ==========================================================================
  // 2. DERIVED VALUES
  // ==========================================================================

  const violationNames = Object.keys(violationFines);
  const penalty = selected.reduce((sum, v) => sum + (violationFines[v] || 0), 0);

  const canIssue =
    plate.trim().length > 0 &&
    selected.length > 0 &&
    !!photoUri &&
    !!clampData;

  const now = new Date();
  const dateIssued = [
    now.toLocaleDateString('en-PH', { weekday: 'short' }),
    now.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }),
    now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
  ].join(' | ');

  const addressLine = formatAddress(address) || location;
  const stampCoords = gpsCoords ?? locationObj;
  const outsideDistrict3 = !!address?.district && !isInDistrict3(address);

  const addViolation = (v) => {
    if (!selected.includes(v)) setSelected([...selected, v]);
  };
  const removeViolation = (v) => setSelected(selected.filter((x) => x !== v));

  const handleLocationSelect = (name) => {
    const loc = LOCATIONS.find((l) => l.name === name);
    if (loc) {
      setLocation(name);
      setLocationObj({ lat: loc.lat, lng: loc.lng });
      setGpsDetected(false);
    }
  };

  // ==========================================================================
  // 3. ISSUE TICKET (clamped)
  // ==========================================================================
  const issueTicket = async () => {
    if (!canIssue || issuing) return;
    setIssuing(true);

    try {
      console.log('[1] Starting issueTicket');
      console.log('[1b] photoUri:', photoUri);
      console.log('[1c] selected:', selected);

      if (!clampData) {
        throw new Error('Clamp data not loaded. Please go back and scan again.');
      }

      console.log('[2] Uploading photo to Supabase...');
      console.log('[2a] uploadViolationPhoto type:', typeof uploadViolationPhoto);

      if (typeof uploadViolationPhoto !== 'function') {
        throw new Error(
          'uploadViolationPhoto is not a function. Check your supabase.js export.'
        );
      }

      // The original photo is the evidence. The location stamp is not burned
      // into it: every screen draws the stamp over the photo from the saved
      // location, time, clamp and plate (on some phones a burned-in copy came
      // out black).
      const photoUrl = await uploadViolationPhoto(photoUri, `pending-${Date.now()}`);
      console.log('[3] Photo uploaded:', photoUrl);

      const violationType = selected.join(', ');
      const year = now.getFullYear();
      const counterRef = doc(db, 'counters', 'cin');
      const violationRef = doc(collection(db, 'violations'));

      const guestId = `guest_${plate.trim().toUpperCase()}`;

      console.log('[4] Computing grace period...');
      const gracePeriodEnd = Timestamp.fromDate(
        new Date(Date.now() + GRACE_PERIOD_HOURS * 60 * 60 * 1000)
      );
      console.log('[5] Grace period end:', gracePeriodEnd);

      const finalCoords = gpsCoords
        ? { lat: gpsCoords.lat, lng: gpsCoords.lng }
        : { lat: locationObj.lat, lng: locationObj.lng };

      const finalBarangay = locationObj.barangay ?? deriveBarangay(location) ?? null;
      const finalSectorId = locationObj.sectorId ?? 'sector-3';

      console.log('[6] Starting transaction...');

      const cin = await runTransaction(db, async (tx) => {
        console.log('[7] Inside transaction');

        // Check the clamp again inside the transaction: another enforcer may
        // have used it since this screen opened (the check on load can be stale).
        const clampNow = await tx.get(doc(db, 'clamps', clampData.docId));
        const clampNowData = clampNow.exists() ? clampNow.data() : null;
        if (!clampNowData) {
          throw new Error('This clamp is no longer registered. Please scan again.');
        }
        if (clampNowData.cin || clampNowData.currentViolationId || clampNowData.deployedAt) {
          throw new Error(
            `This clamp (${clampNowData.clampId ?? clampData.clampId}) was just used on another vehicle.`
          );
        }

        const counterSnap = await tx.get(counterRef);
        console.log('[8] Counter snap exists:', counterSnap.exists());

        const last = counterSnap.exists() ? Number(counterSnap.data().lastValue ?? 0) : 0;
        const next = last + 1;
        const generatedCin = `CLMP-${year}-${String(next).padStart(4, '0')}`;
        console.log('[9] Generated CIN:', generatedCin);

        tx.set(
          counterRef,
          { lastValue: next, prefix: 'CLMP', updatedAt: serverTimestamp() },
          { merge: true }
        );
        console.log('[10] Counter set');

        // VIOLATION DOCUMENT
        tx.set(violationRef, {
          cin: generatedCin,
          plateNo: plate.trim(),
          vehicleMake: make,
          vehicleType: type,
          vehicleColor: color,
          violationType,
          enforcementType,
          clampId: clampData.clampId,

          location,
          locationCoords: finalCoords,
          barangay: finalBarangay,
          sectorId: finalSectorId,

          officer: officerName,
          officerUid,
          fineAmount: penalty,
          photoUrl,
          // photoUrl is the original photo; the stamp is not burned into it.
          photoStamped: false,

          // Exact address from GPS (OpenStreetMap). `location` and `barangay`
          // above stay as before (area names) — the admin heatmap uses them.
          address: address
            ? {
                ...address,
                accuracyM: gpsAccuracy,
                source: 'gps',
                provider: 'openstreetmap',
              }
            : null,

          violatorUid: null,
          guestId: guestId,
          violatorName: null,

          impoundStatus: 'None',
          impoundAutoFlagged: false,
          impoundFlaggedBy: null,
          impoundFee: null,

          gracePeriodHours: GRACE_PERIOD_HOURS,
          gracePeriodEnd: gracePeriodEnd,

          recordedAt: serverTimestamp(),
          paymentStatus: 'Unpaid',
          releaseStatus: 'Pending',
        });
        console.log('[11] Violation doc set');

        // CLAMP DOCUMENT
        console.log('[12] Setting clamp doc:', clampData.docId);
        tx.set(
          doc(db, 'clamps', clampData.docId),
          {
            cin: generatedCin,
            currentViolationId: violationRef.id,
            deployedAt: serverTimestamp(),
            deployedBy: officerName,
            status: 'unpaid',
            lastViolatorUid: null,
            lastGuestId: guestId,
            lastViolatorName: null,
            lastPlateNo: plate.trim(),
            lastViolationAt: serverTimestamp(),
            lastCin: generatedCin,
          },
          { merge: true }
        );
        console.log('[13] Clamp doc set');

        // AUDIT LOG
        console.log('[14] Setting audit log');
        tx.set(doc(collection(db, 'auditLogs')), {
          userName: officerName,
          action: `issued clamping violation ${generatedCin} on plate ${plate.trim()}`,
          record: generatedCin,
          type: 'clamping',
          metadata: {
            cin: generatedCin,
            plateNo: plate.trim(),
            violationType,
            fineAmount: penalty,
            enforcementType,
            clampId: clampData.clampId,
            guestId: guestId,
            location,
            locationCoords: finalCoords,
            barangay: finalBarangay,
            sectorId: finalSectorId,
            gpsDetected: gpsDetected,
            address: formatAddress(address) || null,
          },
          timestamp: serverTimestamp(),
          ipAddress: clientIp(),
        });
        console.log('[15] Audit log set');

        return generatedCin;
      });

      console.log('[16] Transaction complete. CIN:', cin);

      navigation.navigate('Success', {
        violationNo: cin,
        dateIssued,
        plate: plate.trim(),
        violations: selected,
        clampId: clampData?.clampId ?? '',
        penalty,
        place: formatAddress(address) || location,
        vehicle: [make, type, color].filter(Boolean).join(' · '),
        dashboardRoute: 'ClampDashboard',
        officerName,
        officerUid,
      });
    } catch (err) {
      // ============================================================
      // SAFE ERROR HANDLING
      // HUWAG gamitin ang console.error — nag-crash ang LogBox sa RN
      // ============================================================
      console.log('=== ISSUE TICKET FAILED ===');
      console.log('typeof err:', typeof err);
      console.log('err is null?', err === null);
      console.log('err is undefined?', err === undefined);

      let errorMessage = 'Something went wrong. Please try again.';

      if (err) {
        try {
          console.log('err.name:', String(err.name ?? '(no name)'));
          console.log('err.message:', String(err.message ?? '(no message)'));
          console.log('err.code:', String(err.code ?? '(no code)'));
          console.log('err.stack:', String(err.stack ?? '(no stack)'));
          if (err.message) errorMessage = String(err.message);
        } catch (e) {
          console.log('err properties could not be read');
        }
      }

      Alert.alert('Failed to issue ticket', errorMessage);
    } finally {
      setIssuing(false);
    }
  };

  // ==========================================================================
  // 4. CONDITIONAL RETURNS
  // ==========================================================================

  const topBar = (title) => (
    <View style={styles.topBar}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Back to scanner"
      >
        <Icon name="arrow-left" size={22} color={ui.white} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>{title}</Text>
    </View>
  );

  if (clampLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={ui.ink} />
        <View style={styles.header}>{topBar('New Violation')}</View>
        <View style={styles.centerBody}>
          <ActivityIndicator size="large" color={ui.ink} />
          <Text style={styles.centerText}>Checking the clamp…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (clampError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={ui.ink} />
        <View style={styles.header}>{topBar('New Violation')}</View>
        <View style={styles.centerBody}>
          <View style={styles.errorIcon}>
            <Icon name="alert-triangle" size={34} color={ui.danger} />
          </View>
          <Text style={styles.errorTitle}>Can't use this clamp</Text>
          <Text style={styles.centerText}>{clampError}</Text>
          <TouchableOpacity style={[styles.submitBtn, styles.errorBtn]} onPress={() => navigation.goBack()}>
            <Text style={styles.submitText}>Scan again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // 5. MAIN RENDER
  // ==========================================================================

  const missing = [
    !plate.trim() && 'plate number',
    selected.length === 0 && 'violation',
    !photoUri && 'evidence photo',
  ].filter(Boolean);

  const prettyDate = `${now.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} · ${now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;

  let gpsLine = null;
  if (gpsLoading) {
    gpsLine = { tone: 'busy', text: gpsRetryCount > 0 ? `Weak GPS, trying again (${gpsRetryCount}/2)…` : 'Finding your location…' };
  } else if (gpsDetected && gpsCoords) {
    gpsLine = { tone: 'good', text: `GPS${gpsAccuracy != null ? ` · accurate to ${gpsAccuracy} m` : ''}` };
  } else if (gpsError) {
    gpsLine = { tone: 'bad', text: gpsError };
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ui.ink} />

      <View style={styles.header}>
        {topBar('New Violation')}
        <View style={styles.scannedNote}>
          <View style={styles.scannedTick}>
            <Icon name="check" size={18} color={ui.ink} />
          </View>
          <Text style={styles.scannedText}>
            <Text style={styles.scannedStrong}>{typedClampId ? 'Clamp found.' : 'Clamp scanned.'}</Text> Fill in the
            vehicle and violation below.
          </Text>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {/* FILLED IN AUTOMATICALLY */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Filled in automatically</Text>
            <View style={styles.lockTag}>
              <Icon name="lock" size={13} color={ui.muted} />
              <Text style={styles.lockText}>Can't be edited</Text>
            </View>
          </View>

          <View style={styles.autoRow}>
            <View style={styles.autoCell}>
              <Text style={styles.autoLabel}>Violation No.</Text>
              <Text style={styles.autoValueMuted}>Given when you submit</Text>
            </View>
            <View style={styles.autoCell}>
              <Text style={styles.autoLabel}>Clamp ID</Text>
              <Text style={styles.autoValue}>
                {clampData?.clampId || '—'}
                <Text style={styles.autoSub}>  {clampData?.clampType || ''}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.autoLine}>
            <Icon name="clock" size={20} color={ui.text2} />
            <View style={styles.autoLineText}>
              <Text style={styles.autoLabel}>Date & time</Text>
              <Text style={styles.autoValue}>{prettyDate}</Text>
            </View>
          </View>

          <View style={styles.autoLine}>
            <Icon name="map-pin" size={20} color={ui.text2} />
            <View style={styles.autoLineText}>
              <Text style={styles.autoLabel}>Location</Text>
              {addressLoading ? (
                <Text style={styles.autoValueMuted}>Finding the street and barangay…</Text>
              ) : (
                <Text style={styles.autoValue}>{addressLine}</Text>
              )}
              {gpsLine && (
                <View style={styles.gpsRow}>
                  {gpsLine.tone === 'busy' ? (
                    <ActivityIndicator size="small" color={ui.text2} />
                  ) : (
                    <View style={[styles.gpsDot, gpsLine.tone === 'good' ? styles.gpsGood : styles.gpsBad]} />
                  )}
                  <Text style={[styles.gpsText, gpsLine.tone === 'bad' && styles.gpsTextBad]}>{gpsLine.text}</Text>
                </View>
              )}
              {outsideDistrict3 && (
                <Text style={styles.warnText}>Outside District 3 ({address.district}). Check the location.</Text>
              )}
              {!!addressError && !address && !addressLoading && <Text style={styles.gpsText}>{addressError}</Text>}
            </View>
          </View>

          {nearestLocation && !gpsDetected && nearestLocation.distance < 5 && (
            <TouchableOpacity
              style={styles.suggestion}
              onPress={() => {
                setLocation(nearestLocation.name);
                setLocationObj({
                  lat: gpsCoords?.lat ?? nearestLocation.lat,
                  lng: gpsCoords?.lng ?? nearestLocation.lng,
                });
                setGpsDetected(true);
                setGpsError('');
              }}
              accessibilityRole="button"
            >
              <Icon name="navigation" size={18} color={ui.ink} />
              <View style={styles.suggestionText}>
                <Text style={styles.suggestionTitle}>Use nearest: {nearestLocation.name}</Text>
                <Text style={styles.suggestionHint}>{(nearestLocation.distance * 1000).toFixed(0)} m away</Text>
              </View>
              <Icon name="chevron-right" size={18} color={ui.muted} />
            </TouchableOpacity>
          )}

          {!gpsDetected && !gpsLoading && (
            <View style={styles.areaPick}>
              <Text style={styles.fieldLabel}>No GPS? Choose the area</Text>
              <Dropdown large label="Area" value={location} options={LOCATIONS.map((l) => l.name)} onSelect={handleLocationSelect} />
            </View>
          )}

          <TouchableOpacity
            style={styles.smallBtn}
            onPress={() => {
              setGpsDetected(false);
              setGpsError('');
              setNearestLocation(null);
              setGpsRetryCount(0);
              lastLookup.current = null;
              detectLocation(0);
            }}
            disabled={gpsLoading}
            accessibilityRole="button"
          >
            <Icon name="refresh-cw" size={16} color={ui.ink} />
            <Text style={styles.smallBtnText}>Refresh location</Text>
          </TouchableOpacity>
        </View>

        {/* 1 · VEHICLE & VIOLATION */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            <Text style={styles.stepNo}>1 · </Text>Vehicle & violation
          </Text>

          <Text style={styles.fieldLabel}>Plate number</Text>
          <TextInput
            style={styles.plateInput}
            value={plate}
            onChangeText={(t) => setPlate(t.toUpperCase())}
            placeholder="ABC 1234"
            placeholderTextColor="#7A808C"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!issuing}
            accessibilityLabel="Plate number"
          />

          <Text style={styles.fieldLabel}>Make</Text>
          <Dropdown large label="Make" value={make} options={MAKES} onSelect={setMake} />

          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Type</Text>
              <Dropdown large label="Type" value={type} options={TYPES} onSelect={setType} />
            </View>
            <View style={styles.colGap} />
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Color</Text>
              <Dropdown large label="Color" value={color} options={COLORS} onSelect={setColor} />
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.fieldLabel}>{selected.length ? 'Add another violation' : 'Violation type'}</Text>
          {finesLoading ? (
            <Text style={styles.helpText}>Loading violation types…</Text>
          ) : violationNames.length === 0 ? (
            <Text style={styles.helpText}>No violation types set up. Contact the IT Admin.</Text>
          ) : (
            <Dropdown
              large
              label="Violation type"
              value={null}
              placeholder="Select violation…"
              options={violationNames.filter((v) => !selected.includes(v))}
              onSelect={addViolation}
            />
          )}

          {selected.map((v) => (
            <View key={v} style={styles.violationChip}>
              <View style={styles.violationChipText}>
                <Text style={styles.violationName}>{v}</Text>
                <Text style={styles.violationFine}>₱{(violationFines[v] || 0).toLocaleString()}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeViolation(v)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${v}`}
              >
                <Icon name="x" size={20} color={ui.ink} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.penaltyBox}>
            <Text style={styles.penaltyLabel}>Penalty</Text>
            <Text style={styles.penaltyValue}>₱{penalty.toLocaleString()}</Text>
          </View>
        </View>

        {/* 2 · EVIDENCE PHOTO */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            <Text style={styles.stepNo}>2 · </Text>Evidence photo
          </Text>
          <Text style={styles.helpText}>Show the plate and the clamp in one photo. The location is stamped on it.</Text>

          {photoUri ? (
            // Same view as Violation Details, so it looks the same before and after submitting.
            <EvidencePhoto
              violation={{
                photoUri,
                photoStamped: false,
                address: address ? { ...address, accuracyM: gpsCoords ? gpsAccuracy : undefined } : null,
                location,
                barangay: locationObj?.barangay,
                locationCoords: stampCoords,
                recordedAt: photoTakenAt ?? now,
                clampId: clampData?.clampId,
                plateNo: plate.trim(),
                officer: officerName,
              }}
              hint="The location stamp is added from the GPS, time, clamp and plate. Tap to enlarge."
            />
          ) : (
            <View style={styles.photoEmpty}>
              <Icon name="camera" size={30} color={ui.muted} />
              <Text style={styles.photoEmptyText}>No photo yet</Text>
            </View>
          )}

          <TouchableOpacity
            style={photoUri ? styles.outlineBtn : styles.photoBtn}
            onPress={() => navigation.navigate('CapturePhoto', { returnTo: 'ClampingDetails' })}
            disabled={issuing}
            accessibilityRole="button"
          >
            <Icon name="camera" size={20} color={photoUri ? ui.ink : ui.white} />
            <Text style={photoUri ? styles.outlineText : styles.photoBtnText}>
              {photoUri ? 'Retake photo' : 'Take photo'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* SUBMIT */}
        <TouchableOpacity
          style={[styles.submitBtn, (!canIssue || issuing) && styles.submitDisabled]}
          onPress={issueTicket}
          disabled={!canIssue || issuing}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canIssue || issuing }}
        >
          {issuing ? (
            <ActivityIndicator color={ui.white} />
          ) : (
            <>
              <Text style={styles.submitText}>Submit violation</Text>
              <Icon name="arrow-right" size={22} color={ui.white} />
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.submitHint}>
          {missing.length ? `Still needed: ${missing.join(', ')}.` : 'Check the plate number before submitting.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: ui.ink },
  header: {
    backgroundColor: ui.ink,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 18,
  },
  topBar: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  topTitle: { color: ui.white, fontSize: 22, fontWeight: '800', marginLeft: 6 },
  scannedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#1C3A26',
  },
  scannedTick: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#7EE2A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannedText: { flex: 1, marginLeft: 10, fontSize: 15, color: '#DFF3E6' },
  scannedStrong: { color: ui.white, fontWeight: '700' },
  body: { flex: 1, backgroundColor: ui.ground },
  bodyContent: { padding: 16, paddingBottom: 32 },
  centerBody: { flex: 1, backgroundColor: ui.ground, alignItems: 'center', justifyContent: 'center', padding: 28 },
  centerText: { marginTop: 10, fontSize: 15, lineHeight: 22, color: ui.text2, textAlign: 'center' },
  errorIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ui.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: { marginTop: 16, fontSize: 20, fontWeight: '800', color: ui.ink },
  errorBtn: { alignSelf: 'stretch', marginTop: 24 },
  card: {
    backgroundColor: ui.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ui.line,
    padding: 16,
    paddingTop: 18,
    marginBottom: 16,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: ui.ink },
  lockTag: { flexDirection: 'row', alignItems: 'center' },
  lockText: { marginLeft: 5, fontSize: 12, fontWeight: '600', color: ui.muted },
  autoRow: { flexDirection: 'row', marginTop: 8 },
  autoCell: { flex: 1, backgroundColor: ui.ground, borderRadius: 12, padding: 12, marginRight: 8 },
  autoLabel: { fontSize: 12, fontWeight: '600', color: ui.muted, marginBottom: 3 },
  autoValue: { fontSize: 16, fontWeight: '700', color: ui.ink },
  autoValueMuted: { fontSize: 15, fontWeight: '600', color: ui.text2 },
  autoSub: { fontSize: 13, fontWeight: '600', color: ui.muted },
  autoLine: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 },
  autoLineText: { flex: 1, marginLeft: 12 },
  gpsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsGood: { backgroundColor: ui.good },
  gpsBad: { backgroundColor: '#D32F2F' },
  gpsText: { marginLeft: 6, fontSize: 13, color: ui.text2, flexShrink: 1 },
  gpsTextBad: { color: ui.danger, fontWeight: '600' },
  warnText: { marginTop: 6, fontSize: 13, fontWeight: '600', color: '#7A4A00' },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 12,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: ui.field,
  },
  suggestionText: { flex: 1, marginLeft: 10 },
  suggestionTitle: { fontSize: 15, fontWeight: '600', color: ui.ink },
  suggestionHint: { fontSize: 13, color: ui.muted, marginTop: 2 },
  areaPick: { marginTop: 4 },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 44,
    paddingHorizontal: 14,
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: ui.field,
  },
  smallBtnText: { marginLeft: 8, fontSize: 14, fontWeight: '600', color: ui.ink },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: ui.ink, marginBottom: 2 },
  stepNo: { color: ui.muted },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: ui.ink, marginTop: 14, marginBottom: 8 },
  plateInput: {
    height: 60,
    borderWidth: 1.5,
    borderColor: ui.ink,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
    color: ui.ink,
  },
  twoCol: { flexDirection: 'row' },
  col: { flex: 1 },
  colGap: { width: 10 },
  divider: { height: 1, backgroundColor: ui.line, marginTop: 18 },
  helpText: { fontSize: 14, lineHeight: 20, color: ui.text2, marginTop: 4 },
  violationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingLeft: 14,
    borderRadius: 14,
    backgroundColor: ui.ground,
  },
  violationChipText: { flex: 1, paddingVertical: 10 },
  violationName: { fontSize: 15, fontWeight: '700', color: ui.ink },
  violationFine: { fontSize: 13, color: ui.text2, marginTop: 2 },
  removeBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  penaltyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: ui.ink,
  },
  penaltyLabel: { fontSize: 15, fontWeight: '600', color: '#D5D8DE' },
  penaltyValue: { fontSize: 26, fontWeight: '800', color: ui.white },
  stampFrame: { width: '100%', borderRadius: 14, overflow: 'hidden', backgroundColor: '#000', marginTop: 12 },
  stampPhoto: { width: '100%', height: '100%' },
  photoFailed: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  photoFailedText: { marginTop: 8, fontSize: 14, lineHeight: 20, color: ui.white, textAlign: 'center' },
  stampBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  stampTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  stampLine: { color: '#FFFFFF', fontSize: 10, marginTop: 1 },
  stampCredit: { color: 'rgba(255, 255, 255, 0.75)', fontSize: 8, marginTop: 3 },
  photoEmpty: {
    height: 150,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ui.field,
    backgroundColor: ui.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmptyText: { marginTop: 6, fontSize: 14, color: ui.muted },
  photoBtn: {
    flexDirection: 'row',
    height: 56,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: ui.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtnText: { marginLeft: 10, fontSize: 17, fontWeight: '700', color: ui.white },
  outlineBtn: {
    flexDirection: 'row',
    height: 52,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: ui.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineText: { marginLeft: 10, fontSize: 16, fontWeight: '700', color: ui.ink },
  submitBtn: {
    flexDirection: 'row',
    height: 62,
    borderRadius: 18,
    backgroundColor: ui.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitDisabled: { backgroundColor: '#8A8F99' },
  submitText: { color: ui.white, fontSize: 19, fontWeight: '800', marginRight: 10 },
  submitHint: { marginTop: 10, fontSize: 14, color: ui.text2, textAlign: 'center' },
});
