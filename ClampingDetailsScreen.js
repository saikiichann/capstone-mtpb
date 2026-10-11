import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, StatusBar, Image, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import Dropdown from '../components/Dropdown';
import { colors } from '../theme/colors';
import { db } from '../firebase';
import { uploadViolationPhoto } from '../supabase';
import Geolocation from '@react-native-community/geolocation';
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
  // Sampaloc Area (District 3)
  { name: 'Sampaloc - España Boulevard', lat: 14.6095, lng: 120.9890, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - Lacson Avenue', lat: 14.6118, lng: 120.9937, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - Earnshaw Street', lat: 14.6082, lng: 120.9856, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - Dapitan Street', lat: 14.6132, lng: 120.9876, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - P. Noval Street', lat: 14.6108, lng: 120.9895, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - A.H. Lacson Avenue', lat: 14.6118, lng: 120.9937, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - Legarda Street', lat: 14.6003, lng: 120.9925, barangay: 'Sampaloc', sectorId: 'sector-3' },
  { name: 'Sampaloc - Recto Avenue', lat: 14.6042, lng: 120.9889, barangay: 'Sampaloc', sectorId: 'sector-3' },

  // Santa Cruz Area (District 3)
  { name: 'Santa Cruz - Rizal Avenue', lat: 14.6172, lng: 120.9818, barangay: 'Sta. Cruz', sectorId: 'sector-3' },
  { name: 'Santa Cruz - Blumentritt Road', lat: 14.6229, lng: 120.9845, barangay: 'Sta. Cruz', sectorId: 'sector-3' },
  { name: 'Santa Cruz - Oroquieta Street', lat: 14.6104, lng: 120.9829, barangay: 'Sta. Cruz', sectorId: 'sector-3' },
  { name: 'Santa Cruz - Tayuman Street', lat: 14.6180, lng: 120.9828, barangay: 'Sta. Cruz', sectorId: 'sector-3' },
  { name: 'Santa Cruz - Bambang Street', lat: 14.6118, lng: 120.9819, barangay: 'Sta. Cruz', sectorId: 'sector-3' },
  { name: 'Santa Cruz - Fugoso Street', lat: 14.6106, lng: 120.9832, barangay: 'Sta. Cruz', sectorId: 'sector-3' },

  // Quiapo Area (District 3)
  { name: 'Quiapo - Quezon Boulevard', lat: 14.5987, lng: 120.9853, barangay: 'Quiapo', sectorId: 'sector-3' },
  { name: 'Quiapo - Hidalgo Street', lat: 14.5964, lng: 120.9865, barangay: 'Quiapo', sectorId: 'sector-3' },
  { name: 'Quiapo - Villalobos Street', lat: 14.5977, lng: 120.9852, barangay: 'Quiapo', sectorId: 'sector-3' },
  { name: 'Quiapo - Palanca Street', lat: 14.5971, lng: 120.9842, barangay: 'Quiapo', sectorId: 'sector-3' },
  { name: 'Quiapo - Evangelista Street', lat: 14.5965, lng: 120.9848, barangay: 'Quiapo', sectorId: 'sector-3' },

  // San Miguel Area (District 3)
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
  } catch {
    // Not a URL — treat as raw token
  }
  return scanned.trim();
}

/**
 * Haversine formula — calculates distance between two coordinates in kilometers
 */
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

/**
 * Finds the nearest registered location from the LOCATIONS array
 */
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

// ⚠️ ADDED: I-derive ang barangay mula sa location string (fallback)
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
  const [enforcementType, setEnforcementType] = useState('clamped');

  // GPS STATE
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [gpsDetected, setGpsDetected] = useState(false);
  const [nearestLocation, setNearestLocation] = useState(null);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsRetryCount, setGpsRetryCount] = useState(0);

  const [clampData, setClampData] = useState(null);
  const [clampLoading, setClampLoading] = useState(true);
  const [clampError, setClampError] = useState('');

  const [violationFines, setViolationFines] = useState({});
  const [finesLoading, setFinesLoading] = useState(true);

  // ==========================================================================
  // GPS AUTO-DETECT FUNCTION WITH RETRY
  // ==========================================================================
  const detectLocation = (retryCount = 0) => {
    setGpsLoading(true);
    setGpsError('');
    setGpsRetryCount(retryCount);

    // Configure Android location provider
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

        const nearest = findNearestLocation(latitude, longitude);
        console.log('Nearest location:', nearest);

        if (nearest && nearest.distance < 0.5) {
          // Within 500m — auto-set
          setLocation(nearest.name);
          setLocationObj({ lat: latitude, lng: longitude });
          setNearestLocation(nearest);
          setGpsDetected(true);
          setGpsError('');
        } else if (nearest && nearest.distance < 5) {
          // Within 5km — suggest
          setNearestLocation(nearest);
          setGpsDetected(false);
          setGpsError('');
        } else {
          // Beyond 5km — manual
          setGpsError('Not near any registered location. Please select manually.');
          setGpsDetected(false);
        }
        setGpsLoading(false);
        setGpsRetryCount(0);
      },
      (error) => {
        console.error('GPS detection failed:', error);

        // Retry on TIMEOUT (code 3), max 2 retries
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
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 60000,
      }
    );
  };

  // ==========================================================================
  // EFFECT 0: GPS auto-detect on mount
  // ==========================================================================
  useEffect(() => {
    detectLocation();
  }, []);

  // ==========================================================================
  // EFFECT 1: Fetch clamp data based on scanned token
  // ==========================================================================
  useEffect(() => {
    // Skip clamp loading if ticketed mode
    if (enforcementType === 'ticketed') {
      setClampLoading(false);
      setClampError('');
      setClampData(null);
      return;
    }

    if (!rawScan) {
      setClampError('No QR code data received.');
      setClampLoading(false);
      return;
    }

    const fetchClamp = async () => {
      try {
        const scanToken = extractScanToken(rawScan);
        if (!scanToken) {
          throw new Error('Could not read a valid token from the scanned QR code.');
        }

        const clampSnap = await getDocs(
          query(collection(db, 'clamps'), where('scanToken', '==', scanToken))
        );

        if (clampSnap.empty) {
          throw new Error('No clamp found for this QR code. It may not be registered yet.');
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
        console.error('Failed to load clamp:', err);
        setClampError(err.message || 'Failed to load clamp data.');
        setClampLoading(false);
      }
    };

    fetchClamp();
  }, [rawScan, enforcementType]);

  // ==========================================================================
  // EFFECT 2: Fetch clamping fines from Firestore
  // ==========================================================================
  useEffect(() => {
    const q = query(
      collection(db, 'clampingFines'),
      orderBy('order', 'asc')
    );

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
        console.error('Failed to load clamping fines:', err);
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
    (enforcementType === 'ticketed' || (!!rawScan && !!clampData));

  const now = new Date();
  const dateIssued = [
    now.toLocaleDateString('en-PH', { weekday: 'short' }),
    now.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }),
    now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
  ].join(' | ');

  const addViolation = (v) => { if (!selected.includes(v)) setSelected([...selected, v]); };
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
  // 3. ISSUE TICKET (Clamped or Ticketed)
  // ==========================================================================
  const issueTicket = async () => {
    if (!canIssue || issuing) return;
    setIssuing(true);

    try {
      if (enforcementType === 'clamped' && !clampData) {
        throw new Error('Clamp data not loaded. Please go back and scan again.');
      }

      const photoUrl = await uploadViolationPhoto(photoUri, `pending-${Date.now()}`);

      const violationType = selected.join(', ');
      const year = now.getFullYear();
      const counterRef = doc(db, 'counters', 'cin');
      const violationRef = doc(collection(db, 'violations'));

      // Generate guest ID from plate number
      const guestId = `guest_${plate.trim().toUpperCase()}`;

      // Compute grace period end (+24 hours)
      const gracePeriodEnd = Timestamp.fromDate(
        new Date(Date.now() + GRACE_PERIOD_HOURS * 60 * 60 * 1000)
      );

      // Use real GPS coordinates if available, fallback to dropdown
      const finalCoords = gpsCoords
        ? { lat: gpsCoords.lat, lng: gpsCoords.lng }
        : { lat: locationObj.lat, lng: locationObj.lng };

      // ⚠️ ADDED: Derive barangay and sectorId
      // Priority: 1) locationObj from dropdown, 2) deriveBarangay from location string
      const finalBarangay =
        locationObj.barangay ?? deriveBarangay(location) ?? null;
      const finalSectorId = locationObj.sectorId ?? 'sector-3'; // Default to sector-3 for MTPB scope

      const cin = await runTransaction(db, async (tx) => {
        const counterSnap = await tx.get(counterRef);
        const last = counterSnap.exists() ? Number(counterSnap.data().lastValue ?? 0) : 0;
        const next = last + 1;
        const generatedCin = `CLMP-${year}-${String(next).padStart(4, '0')}`;

        tx.set(
          counterRef,
          { lastValue: next, prefix: 'CLMP', updatedAt: serverTimestamp() },
          { merge: true }
        );

        // VIOLATION DOCUMENT
        tx.set(violationRef, {
          cin: generatedCin,
          plateNo: plate.trim(),
          vehicleMake: make,
          vehicleType: type,
          vehicleColor: color,
          violationType,
          enforcementType,
          clampId: enforcementType === 'clamped' ? clampData.clampId : null,

          // Location
          location,
          locationCoords: finalCoords,
          // ⚠️ ADDED: barangay + sectorId para sa heatmap
          barangay: finalBarangay,
          sectorId: finalSectorId,

          officer: officerName,
          officerUid,
          fineAmount: penalty,
          photoUrl,

          // Violator linking
          violatorUid: null,
          guestId: guestId,
          violatorName: null,

          // Impound fields
          impoundStatus: 'None',
          impoundAutoFlagged: false,
          impoundFlaggedBy: null,
          impoundFee: null,

          // Grace period
          gracePeriodHours: GRACE_PERIOD_HOURS,
          gracePeriodEnd: gracePeriodEnd,

          recordedAt: serverTimestamp(),
          paymentStatus: 'Unpaid',
          releaseStatus: 'Pending',
        });

        // CLAMP DOCUMENT (only if clamped)
        if (enforcementType === 'clamped' && clampData) {
          tx.update(doc(db, 'clamps', clampData.docId), {
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
          });
        }

        // AUDIT LOG
        tx.set(doc(collection(db, 'auditLogs')), {
          userName: officerName,
          action:
            enforcementType === 'clamped'
              ? `issued clamping violation ${generatedCin} on plate ${plate.trim()}`
              : `issued ticket ${generatedCin} on plate ${plate.trim()} (no clamp)`,
          record: generatedCin,
          type: enforcementType === 'clamped' ? 'clamping' : 'ticketed',
          metadata: {
            cin: generatedCin,
            plateNo: plate.trim(),
            violationType,
            fineAmount: penalty,
            enforcementType,
            clampId: enforcementType === 'clamped' ? clampData?.clampId : null,
            guestId: guestId,
            location,
            locationCoords: finalCoords,
            // ⚠️ ADDED: barangay + sectorId sa audit log
            barangay: finalBarangay,
            sectorId: finalSectorId,
            gpsDetected: gpsDetected,
          },
          timestamp: serverTimestamp(),
        });

        return generatedCin;
      });

      navigation.navigate('Success', {
        violationNo: cin,
        dateIssued,
        dashboardRoute: 'ClampDashboard',
        officerName,
        officerUid,
      });
    } catch (err) {
      console.error('Issue ticket failed:', err);
      Alert.alert('Failed to issue ticket', err.message || 'Something went wrong. Please try again.');
    } finally {
      setIssuing(false);
    }
  };

  // ==========================================================================
  // 4. CONDITIONAL RETURNS
  // ==========================================================================

  if (clampLoading && enforcementType === 'clamped') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={colors.navy} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={20} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Clamping Details</Text>
          <View style={{ width: 20 }} />
        </View>
        <View style={[styles.body, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={{ marginTop: 12, color: colors.gray }}>Loading clamp data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (clampError && enforcementType === 'clamped') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={colors.navy} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={20} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Clamping Details</Text>
          <View style={{ width: 20 }} />
        </View>
        <View style={[styles.body, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
          <Icon name="alert-circle" size={48} color={colors.red} />
          <Text style={{ marginTop: 16, fontSize: 14, color: colors.black, textAlign: 'center' }}>
            {clampError}
          </Text>
          <TouchableOpacity
            style={[styles.issueBtn, { marginTop: 24, paddingHorizontal: 32 }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.issueBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // 5. MAIN RENDER
  // ==========================================================================

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clamping Details</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {/* ENFORCEMENT TYPE CHOICE */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Enforcement Type</Text>
          <View style={styles.enforcementRow}>
            <TouchableOpacity
              style={[
                styles.enforcementBtn,
                enforcementType === 'clamped' && styles.enforcementBtnActive,
              ]}
              onPress={() => setEnforcementType('clamped')}
              disabled={issuing}
            >
              <Icon
                name="lock"
                size={16}
                color={enforcementType === 'clamped' ? colors.white : colors.black}
              />
              <Text
                style={[
                  styles.enforcementBtnText,
                  enforcementType === 'clamped' && styles.enforcementBtnTextActive,
                ]}
              >
                Clamped
              </Text>
              <Text style={styles.enforcementBtnHint}>With physical clamp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.enforcementBtn,
                enforcementType === 'ticketed' && styles.enforcementBtnActive,
              ]}
              onPress={() => setEnforcementType('ticketed')}
              disabled={issuing}
            >
              <Icon
                name="file-text"
                size={16}
                color={enforcementType === 'ticketed' ? colors.white : colors.black}
              />
              <Text
                style={[
                  styles.enforcementBtnText,
                  enforcementType === 'ticketed' && styles.enforcementBtnTextActive,
                ]}
              >
                Ticketed
              </Text>
              <Text style={styles.enforcementBtnHint}>Ticket only</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CLAMP INFO — only when clamped */}
        {enforcementType === 'clamped' && (
          <View style={[styles.card, { marginTop: 14 }]}>
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.label}>Clamp ID No.</Text>
                <View style={styles.readOnly}>
                  <Text style={styles.readOnlyText}>{clampData?.clampId || '—'}</Text>
                </View>
              </View>
              <View style={{ flex: 2 }}>
                <Text style={styles.label}>Date Issued</Text>
                <View style={styles.readOnly}>
                  <Text style={styles.readOnlyText}>{dateIssued}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* LOCATION CARD WITH GPS */}
        <View style={[styles.card, { marginTop: 14 }]}>
          <View style={styles.locationHeader}>
            <Text style={styles.cardTitle}>Location</Text>
            {gpsLoading && (
              <View style={styles.gpsBadge}>
                <ActivityIndicator size="small" color={colors.navy} />
                <Text style={styles.gpsBadgeText}>
                  {gpsRetryCount > 0 ? `Retrying (${gpsRetryCount}/2)...` : 'Detecting GPS...'}
                </Text>
              </View>
            )}
            {gpsDetected && !gpsLoading && (
              <View style={[styles.gpsBadge, styles.gpsBadgeSuccess]}>
                <Icon name="map-pin" size={12} color={colors.green} />
                <Text style={[styles.gpsBadgeText, { color: colors.green }]}>
                  GPS detected
                </Text>
              </View>
            )}
          </View>

          {gpsError && (
            <View style={styles.gpsError}>
              <Icon name="alert-circle" size={14} color={colors.red} />
              <Text style={styles.gpsErrorText}>{gpsError}</Text>
            </View>
          )}

          {nearestLocation && !gpsDetected && nearestLocation.distance < 5 && (
            <TouchableOpacity
              style={styles.gpsSuggestion}
              onPress={() => {
                setLocation(nearestLocation.name);
                setLocationObj({
                  lat: gpsCoords?.lat ?? nearestLocation.lat,
                  lng: gpsCoords?.lng ?? nearestLocation.lng,
                });
                setGpsDetected(true);
                setGpsError('');
              }}
            >
              <Icon name="map-pin" size={14} color={colors.navy} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.gpsSuggestionText}>
                  Nearest: {nearestLocation.name}
                </Text>
                <Text style={styles.gpsSuggestionHint}>
                  {(nearestLocation.distance * 1000).toFixed(0)}m away — tap to use
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.gray} />
            </TouchableOpacity>
          )}

          <Dropdown
            value={location}
            options={LOCATIONS.map((l) => l.name)}
            onSelect={handleLocationSelect}
          />

          {gpsCoords && (
            <Text style={styles.coordsText}>
              📍 {gpsCoords.lat.toFixed(4)}, {gpsCoords.lng.toFixed(4)}
              {gpsDetected ? ' (using GPS)' : ' (fallback)'}
            </Text>
          )}

          <TouchableOpacity
            style={styles.refreshGpsBtn}
            onPress={() => {
              setGpsDetected(false);
              setGpsError('');
              setNearestLocation(null);
              setGpsRetryCount(0);
              detectLocation(0);
            }}
            disabled={gpsLoading}
          >
            <Icon name="refresh-cw" size={14} color={colors.navy} />
            <Text style={styles.refreshGpsBtnText}>Refresh GPS</Text>
          </TouchableOpacity>
        </View>

        {/* VIOLATION DETAILS */}
        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={styles.cardTitle}>Violation Details</Text>

          <Text style={styles.smallLabel}>PLATE NUMBER</Text>
          <TextInput
            style={styles.input}
            value={plate}
            onChangeText={(t) => setPlate(t.toUpperCase())}
            placeholder="ABC 1234"
            placeholderTextColor={colors.gray}
            autoCapitalize="characters"
            editable={!issuing}
          />

          <View style={[styles.row, { marginTop: 12 }]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>MAKE</Text>
              <Dropdown value={make} options={MAKES} onSelect={setMake} />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>TYPE</Text>
              <Dropdown value={type} options={TYPES} onSelect={setType} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallLabel}>COLOR</Text>
              <Dropdown value={color} options={COLORS} onSelect={setColor} />
            </View>
          </View>

          <Text style={[styles.smallLabel, { marginTop: 12 }]}>VIOLATION/S</Text>
          {finesLoading ? (
            <Text style={styles.emptyText}>Loading violation types...</Text>
          ) : violationNames.length === 0 ? (
            <Text style={styles.emptyText}>No violation types configured. Contact IT Admin.</Text>
          ) : (
            <Dropdown
              value={null}
              placeholder="Add Violations"
              options={violationNames.filter((v) => !selected.includes(v))}
              onSelect={addViolation}
            />
          )}

          <Text style={[styles.smallLabel, { marginTop: 12 }]}>SELECTED VIOLATION/S</Text>
          {selected.length === 0 ? (
            <Text style={styles.emptyText}>No violations selected yet.</Text>
          ) : (
            selected.map((v) => (
              <View key={v} style={styles.violationRow}>
                <Text style={styles.violationText}>{v}</Text>
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeViolation(v)}>
                  <Icon name="x" size={12} color={colors.white} />
                </TouchableOpacity>
              </View>
            ))
          )}

          <Text style={[styles.smallLabel, { marginTop: 14 }]}>PENALTY</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.penalty}>₱ {penalty.toLocaleString()}</Text>
              <TouchableOpacity
                style={styles.photoBtn}
                onPress={() =>
                  navigation.navigate('CapturePhoto', {
                    returnTo: 'ClampingDetails',
                    extraParams: { ...route?.params },
                  })
                }
              >
                <Icon name="camera" size={14} color={colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.photoBtnText}>Capture Photo Proof</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.thumbWrap}>
              {photoUri ? <Image source={{ uri: photoUri }} style={styles.thumb} /> : <View style={styles.thumbEmpty} />}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.issueBtn, (!canIssue || issuing) && styles.issueBtnDisabled]}
          onPress={issueTicket}
          disabled={!canIssue || issuing}
        >
          {issuing ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={[styles.issueBtnText, !canIssue && { color: colors.gray }]}>
              {enforcementType === 'clamped' ? 'Issue Violation Ticket' : 'Issue Ticket (No Clamp)'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()} disabled={issuing}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.navy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 44 },
  backBtn: { padding: 4 },
  headerTitle: { color: colors.white, fontSize: 16, fontWeight: '700' },
  body: { flex: 1, backgroundColor: colors.offWhite },
  card: { backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.black, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  label: { fontSize: 10, fontWeight: '600', color: colors.gray, marginBottom: 4 },
  smallLabel: { fontSize: 9, fontWeight: '700', color: colors.gray, letterSpacing: 0.4, marginBottom: 4 },
  readOnly: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 10, height: 36, justifyContent: 'center', backgroundColor: colors.offWhite },
  readOnlyText: { fontSize: 11, color: colors.black },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 10, height: 36, fontSize: 12, color: colors.black },
  emptyText: { fontSize: 11, color: colors.gray, fontStyle: 'italic', paddingVertical: 6 },
  violationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 10, height: 36, marginBottom: 6 },
  violationText: { fontSize: 12, color: colors.black },
  removeBtn: { width: 20, height: 20, borderRadius: 4, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  penalty: { fontSize: 15, fontWeight: '700', color: colors.black, marginBottom: 8 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.black, borderRadius: 6, height: 34, paddingHorizontal: 12, alignSelf: 'flex-start' },
  photoBtnText: { color: colors.white, fontSize: 11, fontWeight: '600' },
  thumbWrap: { width: 86, height: 62, marginLeft: 12, marginTop: 20 },
  thumb: { width: '100%', height: '100%', borderRadius: 6 },
  thumbEmpty: { width: '100%', height: '100%', borderRadius: 6, backgroundColor: colors.lightGray },
  issueBtn: { backgroundColor: colors.black, borderRadius: 8, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  issueBtnDisabled: { backgroundColor: colors.lightGray },
  issueBtnText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  cancelBtn: { backgroundColor: colors.white, borderRadius: 8, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.black },

  // GPS STYLES
  locationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  gpsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.offWhite, borderRadius: 6 },
  gpsBadgeSuccess: { backgroundColor: '#DCFCE7' },
  gpsBadgeText: { fontSize: 10, fontWeight: '600', color: colors.navy },
  gpsError: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: '#FEF2F2', borderRadius: 6, marginBottom: 8 },
  gpsErrorText: { fontSize: 10, color: colors.red, flex: 1 },
  gpsSuggestion: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: '#EFF6FF', borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#93C5FD' },
  gpsSuggestionText: { fontSize: 11, fontWeight: '600', color: colors.black },
  gpsSuggestionHint: { fontSize: 9, color: colors.gray, marginTop: 2 },
  coordsText: { fontSize: 9, color: colors.gray, marginTop: 8, fontStyle: 'italic' },
  refreshGpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 6 },
  refreshGpsBtnText: { fontSize: 11, fontWeight: '600', color: colors.navy },

  // ENFORCEMENT TYPE STYLES
  enforcementRow: { flexDirection: 'row', gap: 10 },
  enforcementBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  enforcementBtnActive: { borderColor: colors.navy, backgroundColor: colors.navy },
  enforcementBtnText: { fontSize: 13, fontWeight: '700', color: colors.black },
  enforcementBtnTextActive: { color: colors.white },
  enforcementBtnHint: { fontSize: 10, color: colors.gray, fontStyle: 'italic' },
});