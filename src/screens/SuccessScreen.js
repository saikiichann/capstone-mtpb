import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import RNPrint from 'react-native-print';
import { ui } from '../theme/ui';

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Violation recorded: summary, Print ticket, Scan next clamp, Back to home. */
export default function SuccessScreen({ navigation, route }) {
  const p = route?.params || {};
  const violationNo = p.violationNo || '—';
  const plate = p.plate || '—';
  const violations = Array.isArray(p.violations) ? p.violations : [];
  const penalty = Number(p.penalty || 0);
  const officerName = p.officerName || 'Officer';
  const officerUid = p.officerUid || null;
  const dashboardRoute = p.dashboardRoute || 'ClampDashboard';
  const home = { name: dashboardRoute, params: { officerName, officerUid } };

  const backHome = () => navigation.reset({ index: 0, routes: [home] });
  const scanNext = () =>
    navigation.reset({ index: 1, routes: [home, { name: 'ScanQR', params: { officerName, officerUid } }] });

  const printTicket = async () => {
    const rows = [
      ['Violation No.', violationNo],
      ['Date issued', p.dateIssued],
      ['Plate number', plate],
      ['Vehicle', p.vehicle],
      ['Violation', violations.join(', ')],
      ['Clamp ID', p.clampId],
      ['Location', p.place],
      ['Enforcer', officerName],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td style="color:#5B616E;padding:6px 0">${esc(k)}</td><td style="text-align:right;font-weight:600">${esc(v)}</td></tr>`)
      .join('');
    const html = `<html><body style="font-family:-apple-system,Roboto,sans-serif;padding:24px;color:#0E0F12">
      <h2 style="margin:0">Manila Traffic &amp; Parking Bureau</h2>
      <p style="margin:4px 0 16px;color:#5B616E">Clamping violation ticket</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
      <p style="margin-top:16px;font-size:20px;font-weight:800">Penalty: ₱${penalty.toLocaleString()}</p>
      <p style="font-size:12px;color:#5B616E">Pay within 24 hours to avoid the ₱2,000 overdue fee. Scan the QR code on the clamp to pay online.</p>
    </body></html>`;
    try {
      await RNPrint.print({ html });
    } catch (e) {
      Alert.alert('Print failed', 'The ticket could not be printed. Please try again.');
    }
  };

  const line = (label, value, big = false) => (
    <View style={styles.dlRow}>
      <Text style={styles.dt}>{label}</Text>
      <Text style={[styles.dd, big && styles.ddBig]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={ui.white} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.ring}>
            <View style={styles.check}>
              <Icon name="check" size={38} color={ui.white} />
            </View>
          </View>
          <Text style={styles.title}>Violation recorded</Text>
          <Text style={styles.body}>
            Saved and sent to the office. It now shows in your Activity as <Text style={styles.bold}>Unpaid</Text>.
          </Text>
        </View>

        <View style={styles.dl}>
          {line('Plate number', plate, true)}
          {line('Violation', violations.length ? violations.join(', ') : '—')}
          {line('Violation No.', violationNo)}
          {!!p.clampId && line('Clamp ID', p.clampId)}
          <View style={styles.hr} />
          <View style={styles.dlRow}>
            <Text style={styles.totalLabel}>Penalty</Text>
            <Text style={styles.totalValue}>₱{penalty.toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.printBtn} onPress={printTicket} accessibilityRole="button">
            <Icon name="printer" size={22} color={ui.ink} />
            <Text style={styles.printText}>Print ticket</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.scanBtn} onPress={scanNext} accessibilityRole="button">
            <MCIcon name="qrcode-scan" size={24} color={ui.ink} />
            <Text style={styles.scanText}>Scan next clamp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.homeBtn} onPress={backHome} accessibilityRole="button">
            <Text style={styles.homeText}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: ui.white },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 28 },
  hero: { alignItems: 'center' },
  ring: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: ui.goodSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: ui.good,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 16, fontSize: 28, fontWeight: '800', color: ui.ink, textAlign: 'center' },
  body: { marginTop: 8, fontSize: 16, lineHeight: 24, color: ui.text2, textAlign: 'center' },
  bold: { fontWeight: '700', color: ui.ink },
  dl: { marginTop: 24, padding: 18, borderRadius: 20, backgroundColor: ui.ground },
  dlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 7 },
  dt: { fontSize: 14, color: ui.muted, marginRight: 12 },
  dd: { flex: 1, fontSize: 15, fontWeight: '600', color: ui.ink, textAlign: 'right' },
  ddBig: { fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  hr: { height: 1, backgroundColor: ui.field, marginVertical: 6 },
  totalLabel: { fontSize: 15, fontWeight: '600', color: ui.ink },
  totalValue: { fontSize: 26, fontWeight: '800', color: ui.ink },
  actions: { marginTop: 'auto', paddingTop: 24 },
  printBtn: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: ui.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printText: { marginLeft: 10, fontSize: 16, fontWeight: '700', color: ui.ink },
  scanBtn: {
    flexDirection: 'row',
    height: 62,
    borderRadius: 18,
    backgroundColor: ui.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  scanText: { marginLeft: 10, fontSize: 19, fontWeight: '800', color: ui.ink },
  homeBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  homeText: { fontSize: 16, fontWeight: '600', color: ui.ink },
});
