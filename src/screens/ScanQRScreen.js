import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { Camera } from 'react-native-camera-kit';
import { colors } from '../theme/colors';

export default function ScanQRScreen({ navigation, route }) {
  const [flashOn, setFlashOn] = useState(false);
  const [scanned, setScanned] = useState(false);

  /**
   * Forwards whatever was already in route.params (e.g. officerName,
   * officerUid from LoginScreen → ClampDashboard, if ClampDashboard
   * passes them along) plus clampCode — so ClampingDetailsScreen gets
   * the officer identity without this screen needing to know its exact
   * param names. If ClampDashboardScreen doesn't currently forward
   * those through to here, this spread has nothing to pick up and
   * ClampingDetailsScreen falls back to "Unknown Officer" — worth
   * checking ClampDashboardScreen.js for this.
   */
  const onReadCode = (event) => {
    if (scanned) return;
    setScanned(true);
    const value = event?.nativeEvent?.codeStringValue;
    navigation.navigate('ClampingDetails', { ...route?.params, clampCode: value });
    setTimeout(() => setScanned(false), 1000);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Clamp QR</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.scannerCard}>
          <View style={styles.scannerFrame}>
            <Camera
              style={StyleSheet.absoluteFill}
              scanBarcode={true}
              onReadCode={onReadCode}
              showFrame={false}
              torchMode={flashOn ? 'on' : 'off'}
            />
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          </View>
          <Text style={styles.caption}>Scan the QR code on the clamp to apply</Text>
        </View>

        {/* The old hardcoded "Scan QR" shortcut button (navigated with a
            fake clampCode: 'L-14' that skips the camera entirely) has
            been removed — it bypassed real scanning and would hit a
            clamp lookup that doesn't exist in Firestore. Real scanning
            via the camera above is now the only path. */}

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setFlashOn((v) => !v)}>
          <Icon name="zap" size={16} color={colors.black} style={{ marginRight: 8 }} />
          <Text style={styles.secondaryBtnText}>
            {flashOn ? 'Turn off Flashlight' : 'Turn on Flashlight'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const CORNER_SIZE = 28;
const CORNER_THICKNESS = 4;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.navy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 44 },
  backBtn: { padding: 4 },
  headerTitle: { color: colors.white, fontSize: 16, fontWeight: '700' },
  body: { flex: 1, backgroundColor: colors.offWhite, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 24 },
  scannerCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, alignItems: 'center' },
  scannerFrame: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.black },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: colors.green },
  cornerTL: { top: 16, left: 16, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  cornerTR: { top: 16, right: 16, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  cornerBL: { bottom: 16, left: 16, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  cornerBR: { bottom: 16, right: 16, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  caption: { fontSize: 12, color: colors.gray, marginTop: 12, textAlign: 'center' },
  primaryBtn: { backgroundColor: colors.black, borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  primaryBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: colors.black },
});