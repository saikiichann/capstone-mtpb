import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, StatusBar, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import Dropdown from '../components/Dropdown';
import { colors } from '../theme/colors';
import { createViolation } from '../services/violationsService';

// District 3 (Manila: Binondo, Quiapo, San Nicolas, Santa Cruz)
const LOCATIONS: string[] = [
  'Sector 3 - Rizal Avenue (Santa Cruz)',
  'Sector 3 - Escolta Street (Binondo)',
  'Sector 3 - Ongpin Street (Binondo)',
  'Sector 3 - Quintin Paredes Road (Binondo)',
  'Sector 3 - Plaza Miranda / Hidalgo St (Quiapo)',
  'Sector 3 - Quezon Boulevard (Quiapo)',
  'Sector 3 - Carriedo Street (Santa Cruz)',
  'Sector 3 - San Fernando Street (San Nicolas)',
  'Sector 3 - Recto Avenue (District 3 Portion)',
];

// Kasama na ang Motorcycle Brands & Car Makes
const MAKES: string[] = [
  'Honda',
  'Yamaha',
  'Suzuki',
  'Kawasaki',
  'TVS',
  'Vespa',
  'SYM',
  'Kymco',
  'Toyota',
  'Mitsubishi',
  'Nissan',
  'Hyundai',
  'Ford',
  'Isuzu'
];

// Inuna ang Motorcycle sa Vehicle Types
const TYPES: string[] = ['Motorcycle', 'Scooter', 'Sedan', 'SUV', 'Hatchback', 'Van', 'Pickup', 'Truck'];
const COLORS: string[] = ['Black', 'White', 'Silver', 'Gray', 'Red', 'Blue', 'Green', 'Yellow', 'Matte Black'];

const VIOLATIONS: Record<string, number> = {
  Obstruction: 900,
  'Illegal Parking': 500,
  'No Parking Zone': 1000,
  'Blocking Driveway': 800,
  'Double Parking': 700,
  'Parking on Sidewalk': 1000,
};

interface ClampingDetailsScreenProps {
  navigation: any;
  route?: {
    params?: {
      clampCode?: string;
      clampId?: string;
      rawQrData?: string;
      photoUri?: string;
    };
  };
}

export default function ClampingDetailsScreen({ navigation, route }: ClampingDetailsScreenProps) {
  const clampCode = route?.params?.clampCode || route?.params?.clampId || 'CLAMP-001';
  const photoUri = route?.params?.photoUri;

  const [location, setLocation] = useState<string>(LOCATIONS[0]);
  const [plate, setPlate] = useState<string>('');
  const [make, setMake] = useState<string>('Honda');
  const [type, setType] = useState<string>('Motorcycle'); // Defaulted to Motorcycle / Scooter
  const [color, setColor] = useState<string>('Black');
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const penalty = selected.reduce((sum, v) => sum + (VIOLATIONS[v] || 0), 0);
  const canIssue = plate.trim().length > 0 && selected.length > 0 && !!photoUri;

  const now = new Date();
  const dateIssued = [
    now.toLocaleDateString('en-PH', { weekday: 'short' }),
    now.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }),
    now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
  ].join(' | ');

  const addViolation = (v: string) => {
    if (!selected.includes(v)) setSelected([...selected, v]);
  };

  const removeViolation = (v: string) => setSelected(selected.filter((x) => x !== v));

  const issueTicket = async () => {
    setSubmitting(true);
    try {
      const record = await createViolation({
        clampCode,
        location,
        plate,
        make,
        type,
        color,
        violations: selected,
        penalty,
        photoLocalUri: photoUri,
        district: 'District 3',
        sector: 'Sector 3',
      });

      navigation.navigate('Success', {
        violationNo: record.id,
        dateIssued,
        dashboardRoute: 'ClampDashboard',
      });
    } catch (e: any) {
      Alert.alert('Failed to submit', e.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clamping Details</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {/* Clamp Info & Location */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.label}>Clamp ID No.</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText} numberOfLines={1}>{clampCode}</Text>
              </View>
            </View>
            <View style={{ flex: 2 }}>
              <Text style={styles.label}>Date Issued</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{dateIssued}</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>Location (District 3 / Sector 3)</Text>
          <Dropdown value={location} options={LOCATIONS} onSelect={setLocation} />
        </View>

        {/* Violation Details Form */}
        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={styles.cardTitle}>Vehicle & Violation Details</Text>

          <Text style={styles.smallLabel}>PLATE / MV FILE NUMBER</Text>
          <TextInput
            style={styles.input}
            value={plate}
            onChangeText={(t) => setPlate(t.toUpperCase())}
            placeholder="ABC 1234 / 1234-56789"
            placeholderTextColor={colors.gray}
            autoCapitalize="characters"
          />

          <View style={[styles.row, { marginTop: 12 }]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>MAKE / BRAND</Text>
              <Dropdown value={make} options={MAKES} onSelect={setMake} />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>VEHICLE TYPE</Text>
              <Dropdown value={type} options={TYPES} onSelect={setType} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallLabel}>COLOR</Text>
              <Dropdown value={color} options={COLORS} onSelect={setColor} />
            </View>
          </View>

          <Text style={[styles.smallLabel, { marginTop: 12 }]}>VIOLATION/S</Text>
          <Dropdown
            value={null}
            placeholder="Add Violations"
            options={Object.keys(VIOLATIONS).filter((v) => !selected.includes(v))}
            onSelect={addViolation}
          />

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
                    extraParams: { clampCode, clampId: clampCode },
                  })
                }
              >
                <Icon name="camera" size={14} color={colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.photoBtnText}>Capture Photo Proof</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.thumbWrap}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.thumb} />
              ) : (
                <View style={styles.thumbEmpty} />
              )}
            </View>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.issueBtn, (!canIssue || submitting) && styles.issueBtnDisabled]}
          onPress={issueTicket}
          disabled={!canIssue || submitting}
        >
          <Text style={[styles.issueBtnText, !canIssue && { color: colors.gray }]}>
            {submitting ? 'Submitting...' : 'Issue Violation Ticket'}
          </Text>
        </TouchableOpacity>

        {/* Cancel Button */}
        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.navigate('ClampDashboard')}>
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
  readOnlyText: { fontSize: 11, color: colors.black, fontWeight: '600' },
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