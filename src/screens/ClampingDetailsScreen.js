import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, StatusBar, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import Dropdown from '../components/Dropdown';
import { colors } from '../theme/colors';
import { db } from '../firebase';
import { uploadViolationPhoto } from '../supabase';
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
} from 'firebase/firestore';

// ============================================================================
// SECTOR 3, MANILA (DISTRICT 3) — REAL LOCATIONS WITH COORDINATES
// ============================================================================
const LOCATIONS = [
  // Sampaloc Area (District 3)
  { name: 'Sampaloc - España Boulevard', lat: 14.6095, lng: 120.9890 },
  { name: 'Sampaloc - Lacson Avenue', lat: 14.6118, lng: 120.9937 },
  { name: 'Sampaloc - Earnshaw Street', lat: 14.6082, lng: 120.9856 },
  { name: 'Sampaloc - Dapitan Street', lat: 14.6132, lng: 120.9876 },
  { name: 'Sampaloc - P. Noval Street', lat: 14.6108, lng: 120.9895 },
  { name: 'Sampaloc - A.H. Lacson Avenue', lat: 14.6118, lng: 120.9937 },
  { name: 'Sampaloc - Legarda Street', lat: 14.6003, lng: 120.9925 },
  { name: 'Sampaloc - Recto Avenue', lat: 14.6042, lng: 120.9889 },

  // Santa Cruz Area (District 3)
  { name: 'Santa Cruz - Rizal Avenue', lat: 14.6172, lng: 120.9818 },
  { name: 'Santa Cruz - Blumentritt Road', lat: 14.6229, lng: 120.9845 },
  { name: 'Santa Cruz - Oroquieta Street', lat: 14.6104, lng: 120.9829 },
  { name: 'Santa Cruz - Tayuman Street', lat: 14.6180, lng: 120.9828 },
  { name: 'Santa Cruz - Bambang Street', lat: 14.6118, lng: 120.9819 },
  { name: 'Santa Cruz - Fugoso Street', lat: 14.6106, lng: 120.9832 },

  // Quiapo Area (District 3)
  { name: 'Quiapo - Quezon Boulevard', lat: 14.5987, lng: 120.9853 },
  { name: 'Quiapo - Hidalgo Street', lat: 14.5964, lng: 120.9865 },
  { name: 'Quiapo - Villalobos Street', lat: 14.5977, lng: 120.9852 },
  { name: 'Quiapo - Palanca Street', lat: 14.5971, lng: 120.9842 },
  { name: 'Quiapo - Evangelista Street', lat: 14.5965, lng: 120.9848 },

  // San Miguel Area (District 3)
  { name: 'San Miguel - Ayala Bridge', lat: 14.5921, lng: 120.9898 },
  { name: 'San Miguel - Malacañang Area', lat: 14.5941, lng: 120.9947 },
  { name: 'San Miguel - Nepomuceno Street', lat: 14.5952, lng: 120.9935 },
];

const MAKES = ['Honda', 'Toyota', 'Mitsubishi', 'Nissan', 'Hyundai', 'Ford', 'Suzuki', 'Isuzu', 'Kia', 'Mazda'];
const TYPES = ['Sedan', 'SUV', 'Hatchback', 'Van', 'Pickup', 'Motorcycle', 'Truck', 'AUV', 'MPV'];
const COLORS = ['Black', 'White', 'Silver', 'Gray', 'Red', 'Blue', 'Green', 'Yellow', 'Brown', 'Orange'];

function extractScanToken(scanned) {
  if (!scanned) return null;
  try {
    const url = new URL(scanned);
    const t = url.searchParams.get('t');
    if (t) return t;
  } catch {
    // Not a URL — fall through to treating it as a raw token.
  }
  return scanned.trim();
}

export default function ClampingDetailsScreen({ navigation, route }) {
  // ==========================================================================
  // 1. LAHAT NG HOOKS — WALANG CONDITIONAL RETURN DITO
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

  const [clampData, setClampData] = useState(null);
  const [clampLoading, setClampLoading] = useState(true);
  const [clampError, setClampError] = useState('');

  const [violationFines, setViolationFines] = useState({});
  const [finesLoading, setFinesLoading] = useState(true);

  // === EFFECT 1: Hanapin ang clamp base sa scanToken mula sa QR ===
  useEffect(() => {
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
  }, [rawScan]);

  // === EFFECT 2: Kunin ang clampingFines mula sa Firestore ===
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
  // 2. DERIVED VALUES AT FUNCTIONS
  // ==========================================================================

  const violationNames = Object.keys(violationFines);
  const penalty = selected.reduce((sum, v) => sum + (violationFines[v] || 0), 0);
  const canIssue = plate.trim().length > 0 && selected.length > 0 && !!photoUri && !!rawScan && !!clampData;

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
      setLocationObj(loc);
    }
  };

  const issueTicket = async () => {
    if (!canIssue || issuing) return;
    setIssuing(true);

    try {
      if (!clampData) {
        throw new Error('Clamp data not loaded. Please go back and scan again.');
      }

      const photoUrl = await uploadViolationPhoto(photoUri, `pending-${Date.now()}`);

      const violationType = selected.join(', ');
      const year = now.getFullYear();
      const counterRef = doc(db, 'counters', 'cin');
      const violationRef = doc(collection(db, 'violations'));

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

        tx.set(violationRef, {
          cin: generatedCin,
          plateNo: plate.trim(),
          vehicleMake: make,
          vehicleType: type,
          vehicleColor: color,
          violationType,
          enforcementType: 'clamped',
          location,
          locationCoords: {
            lat: locationObj.lat,
            lng: locationObj.lng,
          },
          officer: officerName,
          officerUid,
          fineAmount: penalty,
          photoUrl,
          clampId: clampData.clampId,
          recordedAt: serverTimestamp(),
          paymentStatus: 'Unpaid',
          releaseStatus: 'Pending',
        });

        tx.update(doc(db, 'clamps', clampData.docId), {
          cin: generatedCin,
          currentViolationId: violationRef.id,
          deployedAt: serverTimestamp(),
          deployedBy: officerName,
          status: 'unpaid',
        });

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
            clampId: clampData.clampId,
            location,
            locationCoords: { lat: locationObj.lat, lng: locationObj.lng },
          },
          timestamp: serverTimestamp(),
        });

        return generatedCin;
      });

      // ⚠️ FIX: Ipasok ang officerName at officerUid sa Success navigation
      navigation.navigate('Success', {
        violationNo: cin,
        dateIssued,
        dashboardRoute: 'ClampDashboard',
        officerName,        // ← IDAGDAG
        officerUid,         // ← IDAGDAG
      });
    } catch (err) {
      console.error('Issue ticket failed:', err);
      Alert.alert('Failed to issue ticket', err.message || 'Something went wrong. Please try again.');
    } finally {
      setIssuing(false);
    }
  };

  // ==========================================================================
  // 3. CONDITIONAL RETURNS
  // ==========================================================================

  if (clampLoading) {
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

  if (clampError) {
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
  // 4. MAIN RENDER
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
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.label}>Clamp ID No.</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>
                  {clampData?.clampId || '—'}
                </Text>
              </View>
            </View>
            <View style={{ flex: 2 }}>
              <Text style={styles.label}>Date Issued</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{dateIssued}</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>Location</Text>
          <Dropdown
            value={location}
            options={LOCATIONS.map((l) => l.name)}
            onSelect={handleLocationSelect}
          />
        </View>

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
            <Text style={[styles.issueBtnText, !canIssue && { color: colors.gray }]}>Issue Violation Ticket</Text>
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
});