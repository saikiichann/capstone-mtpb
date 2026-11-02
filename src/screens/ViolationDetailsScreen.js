import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import RNPrint from 'react-native-print';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { colors } from '../theme/colors';
import EvidencePhoto, { stampLinesOf } from '../components/EvidencePhoto';
import { formatAddress } from '../utils/geocode';
import {
  CLAMP_STATES,
  amountDueOf,
  clampStateOf,
  graceLeftText,
  toMillis,
} from '../utils/clampState';

const formatDateTime = (ms) => {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })} | ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
};

const peso = (n) => `₱ ${Number(n || 0).toLocaleString()}`;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Firestore violation document → the fields this screen uses. */
const fromDoc = (id, data) => ({
  docId: id,
  id: data.cin || id,
  cin: data.cin || id,
  recordedAt: toMillis(data.recordedAt),
  gracePeriodEnd: toMillis(data.gracePeriodEnd),
  releasedAt: toMillis(data.releasedAt),
  location: data.location || '',
  barangay: data.barangay || '',
  address: data.address || null,
  locationCoords: data.locationCoords || null,
  plate: data.plateNo || '',
  plateNo: data.plateNo || '',
  make: data.vehicleMake || '',
  type: data.vehicleType || '',
  color: data.vehicleColor || '',
  violation: data.violationType || '',
  clampId: data.clampId || '',
  officer: data.officer || '',
  fineAmount: Number(data.fineAmount) || 0,
  totalPaid: data.totalPaid ?? null,
  paymentStatus: data.paymentStatus || 'Unpaid',
  releaseStatus: data.releaseStatus || 'Pending',
  photoUrl: data.photoUrl || null,
  photoStamped: data.photoStamped === true,
});

export default function ViolationDetailsScreen({ navigation, route }) {
  const initial = route?.params?.record || {};
  const [record, setRecord] = useState(initial);
  const [now, setNow] = useState(Date.now());

  // Live: the state changes here as soon as the payment or release changes.
  useEffect(() => {
    if (!initial.docId) return undefined;
    const unsubscribe = onSnapshot(
      doc(db, 'violations', initial.docId),
      (snap) => {
        if (snap.exists()) setRecord(fromDoc(snap.id, snap.data()));
      },
      (err) => console.log('Violation details listener:', err?.code)
    );
    return () => unsubscribe();
  }, [initial.docId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Older records passed `amount` instead of `fineAmount`.
  const v = { ...record, fineAmount: record.fineAmount ?? record.amount };
  const state = clampStateOf(v, now);
  const st = CLAMP_STATES[state];
  const amountDue = amountDueOf(v, state);
  const left = state === 'unpaid' ? graceLeftText(v, now) : null;

  const exactAddress = formatAddress(v.address);
  const district = v.address?.district || null;
  const barangay = v.address?.barangay || v.barangay || null;
  const coords = v.locationCoords;
  const hasCoords = coords?.lat != null && coords?.lng != null;
  const dateIssued = v.dateFull || formatDateTime(toMillis(v.recordedAt));

  const openMap = () => {
    if (!hasCoords) return;
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
    ).catch(() => Alert.alert('Map', 'Could not open the map app.'));
  };

  const handlePrint = async () => {
    const stamp = stampLinesOf(v);
    const photo = v.photoUrl || v.photoUri;
    const stampHtml = v.photoStamped
      ? ''
      : `<div style="position:absolute;left:0;right:0;bottom:0;padding:8px 10px;background:rgba(0,0,0,.55);color:#fff;font-size:11px;line-height:1.35;">
           <div style="font-weight:bold;font-size:12px;">${escapeHtml(stamp.place)}</div>
           ${stamp.coordLine ? `<div>${escapeHtml(stamp.coordLine)}</div>` : ''}
           ${stamp.detailLine ? `<div>${escapeHtml(stamp.detailLine)}</div>` : ''}
           ${stamp.officerLine ? `<div>${escapeHtml(stamp.officerLine)}</div>` : ''}
           ${stamp.credit ? `<div style="opacity:.75;font-size:9px;">${escapeHtml(stamp.credit)}</div>` : ''}
         </div>`;
    const photoBlock = photo
      ? `<div style="position:relative;margin-top:16px;border-radius:8px;overflow:hidden;">
           <img src="${escapeHtml(photo)}" style="width:100%;display:block;" />
           ${stampHtml}
         </div>`
      : '';

    const html = `
      <html>
        <body style="font-family: -apple-system, Roboto, sans-serif; padding: 24px; color: #111;">
          <div style="background:${st.bg}; color:${st.color}; text-align:center; padding:12px; border-radius:8px; font-weight:bold; font-size:16px;">
            ${escapeHtml(st.label)}
          </div>

          <h2 style="margin-top:24px;">Violation Details</h2>

          <p><strong>Violation Number:</strong> ${escapeHtml(v.cin || v.id)}</p>
          <p><strong>Date Issued:</strong> ${escapeHtml(dateIssued)}</p>
          <p><strong>Location:</strong> ${escapeHtml(exactAddress || v.location)}</p>
          ${hasCoords ? `<p><strong>GPS:</strong> ${Number(coords.lat).toFixed(5)}, ${Number(coords.lng).toFixed(5)}</p>` : ''}
          <p><strong>Plate Number:</strong> ${escapeHtml(v.plate)}</p>
          ${v.clampId ? `<p><strong>Clamp:</strong> ${escapeHtml(v.clampId)}</p>` : ''}
          <p><strong>Make / Type / Color:</strong> ${escapeHtml(v.make)} / ${escapeHtml(v.type)} / ${escapeHtml(v.color)}</p>
          <p><strong>Violation/s:</strong> ${escapeHtml(v.violation)}</p>
          <p><strong>Penalty:</strong> ${peso(v.fineAmount)}</p>
          <p><strong>Amount ${st.settled ? 'Paid' : 'Due'}:</strong> ${peso(amountDue)}</p>

          ${photoBlock}
        </body>
      </html>
    `;

    try {
      await RNPrint.print({ html });
    } catch (e) {
      Alert.alert('Print failed', 'Failed to print violation details. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Violation Details</Text>
        <TouchableOpacity onPress={handlePrint} style={styles.printBtn} accessibilityLabel="Print">
          <Icon name="printer" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {/* STATE — same states as QR Management */}
        <View style={[styles.banner, { backgroundColor: st.bg, borderColor: st.solid }]}>
          <Text style={[styles.bannerText, { color: st.color }]}>{st.label}</Text>
          <Text style={[styles.bannerNote, { color: st.color }]}>
            {st.note}
            {left ? `  ${left} before ₱2,000.` : ''}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Date Issued</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{dateIssued}</Text>
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>Location</Text>
          <View style={styles.locationBox}>
            {(district || barangay) && (
              <View style={styles.chipRow}>
                {district && (
                  <View style={[styles.chip, styles.chipDistrict]}>
                    <Text style={[styles.chipText, { color: '#3730A3' }]}>{district}</Text>
                  </View>
                )}
                {barangay && (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{barangay}</Text>
                  </View>
                )}
              </View>
            )}
            <Text style={styles.locationText}>{exactAddress || v.location || '—'}</Text>
            {!!exactAddress && !!v.location && v.location !== exactAddress && (
              <Text style={styles.locationSub}>Area: {v.location}</Text>
            )}
            {hasCoords && (
              <Text style={styles.locationSub}>
                {Number(coords.lat).toFixed(5)}, {Number(coords.lng).toFixed(5)}
                {v.address?.accuracyM != null ? `  ±${v.address.accuracyM} m` : ''}
              </Text>
            )}
            {hasCoords && (
              <TouchableOpacity style={styles.mapBtn} onPress={openMap}>
                <Icon name="map-pin" size={13} color={colors.black} />
                <Text style={styles.mapBtnText}>Open in Maps</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={styles.cardTitle}>Violation Details</Text>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>VIOLATION NUMBER</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{v.cin || v.id}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallLabel}>CLAMP</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{v.clampId || '—'}</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.smallLabel, { marginTop: 10 }]}>PLATE NUMBER</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{v.plate}</Text>
          </View>

          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>MAKE</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{v.make}</Text>
              </View>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>TYPE</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{v.type}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallLabel}>COLOR</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{v.color}</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.smallLabel, { marginTop: 10 }]}>VIOLATION/S</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{v.violation}</Text>
          </View>

          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>PENALTY</Text>
              <Text style={styles.penalty}>{peso(v.fineAmount)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallLabel}>{st.settled ? 'TOTAL PAID' : 'AMOUNT DUE NOW'}</Text>
              <Text style={[styles.penalty, { color: st.settled ? colors.black : st.color }]}>
                {peso(amountDue)}
              </Text>
            </View>
          </View>

          {state === 'released' && toMillis(v.releasedAt) && (
            <>
              <Text style={styles.smallLabel}>RELEASED AT</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{formatDateTime(toMillis(v.releasedAt))}</Text>
              </View>
            </>
          )}
        </View>

        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={styles.cardTitle}>Evidence Photo</Text>
          <EvidencePhoto violation={v} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.navy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, height: 64 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  printBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  body: { flex: 1, backgroundColor: '#F3F4F6' },
  banner: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  bannerText: { fontSize: 20, fontWeight: '800' },
  bannerNote: { fontSize: 14, lineHeight: 20, marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.black, marginBottom: 12 },
  row: { flexDirection: 'row' },
  label: { fontSize: 13, fontWeight: '600', color: '#5B616E', marginBottom: 6 },
  smallLabel: { fontSize: 12, fontWeight: '700', color: '#5B616E', letterSpacing: 0.4, marginBottom: 6 },
  readOnly: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    minHeight: 46,
    justifyContent: 'center',
    backgroundColor: colors.offWhite,
  },
  readOnlyText: { fontSize: 15, color: colors.black },
  locationBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    backgroundColor: colors.offWhite,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.lightGray },
  chipDistrict: { backgroundColor: '#EEF2FF' },
  chipText: { fontSize: 10, fontWeight: '700', color: colors.black },
  locationText: { fontSize: 12, fontWeight: '700', color: colors.black },
  locationSub: { fontSize: 10, color: colors.gray, marginTop: 3 },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  mapBtnText: { fontSize: 11, fontWeight: '600', color: colors.black },
  penalty: { fontSize: 15, fontWeight: '700', color: colors.black, marginBottom: 12 },
});
