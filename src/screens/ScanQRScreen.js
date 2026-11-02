import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { Camera } from 'react-native-camera-kit';
import { useIsFocused } from '@react-navigation/native';
import { ui } from '../theme/ui';

/**
 * Scan Clamp QR: full-screen camera with an amber frame. It reads the code
 * on its own; "Type clamp ID instead" is for a damaged sticker.
 */
export default function ScanQRScreen({ navigation, route }) {
  // Turn the camera off while another screen is on top (New Violation,
  // the photo camera). Older phones can't open the camera twice, and the
  // evidence photo then comes out black.
  const focused = useIsFocused();
  const [flashOn, setFlashOn] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualId, setManualId] = useState('');

  const base = { officerName: route?.params?.officerName, officerUid: route?.params?.officerUid };

  const onReadCode = (event) => {
    if (scanned) return;
    const value = event?.nativeEvent?.codeStringValue;
    if (!value) return;
    setScanned(true);
    navigation.navigate('ClampingDetails', { ...base, clampCode: value });
    setTimeout(() => setScanned(false), 1500);
  };

  const submitManual = () => {
    const id = manualId.trim().toUpperCase();
    if (!id) return;
    setManualOpen(false);
    setManualId('');
    navigation.navigate('ClampingDetails', { ...base, clampIdTyped: id });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#17191E" />

      <View style={StyleSheet.absoluteFill}>
        {focused && (
          <Camera
            style={StyleSheet.absoluteFill}
            scanBarcode={true}
            onReadCode={onReadCode}
            showFrame={false}
            torchMode={flashOn ? 'on' : 'off'}
          />
        )}
        <View style={styles.shade} pointerEvents="none" />
      </View>

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.roundBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Cancel scan"
        >
          <Icon name="x" size={22} color={ui.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Clamp QR</Text>
        <TouchableOpacity
          style={[styles.roundBtn, flashOn && styles.roundBtnOn]}
          onPress={() => setFlashOn((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={flashOn ? 'Turn off flashlight' : 'Turn on flashlight'}
        >
          <Icon name="zap" size={22} color={flashOn ? ui.ink : ui.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.middle} pointerEvents="none">
        <Text style={styles.prompt}>Point the camera at the{'\n'}QR code on the clamp</Text>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          <View style={styles.scanLine} />
        </View>
        <View style={styles.hintRow}>
          <Icon name="info" size={16} color="#D5D8DE" />
          <Text style={styles.hint}>Hold still. It scans by itself.</Text>
        </View>
      </View>

      <View style={styles.bottom}>
        <Text style={styles.bottomHint}>QR code damaged or won't scan?</Text>
        <TouchableOpacity style={styles.manualBtn} onPress={() => setManualOpen(true)} accessibilityRole="button">
          <Icon name="edit-3" size={20} color={ui.white} />
          <Text style={styles.manualText}>Type clamp ID instead</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={manualOpen} transparent animationType="slide" onRequestClose={() => setManualOpen(false)}>
        <KeyboardAvoidingView
          style={styles.sheetBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={styles.flex} onPress={() => setManualOpen(false)} accessibilityLabel="Close" />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Type the clamp ID</Text>
            <Text style={styles.sheetBody}>It is printed on the clamp, for example A-20 (car) or 20-01 (motorcycle).</Text>
            <TextInput
              style={styles.sheetInput}
              value={manualId}
              onChangeText={(t) => setManualId(t.toUpperCase())}
              placeholder="A-20"
              placeholderTextColor="#7A808C"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={submitManual}
              returnKeyType="go"
              accessibilityLabel="Clamp ID"
            />
            <TouchableOpacity
              style={[styles.sheetBtn, !manualId.trim() && styles.dim]}
              onPress={submitManual}
              disabled={!manualId.trim()}
              accessibilityRole="button"
            >
              <Text style={styles.sheetBtnText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setManualOpen(false)} accessibilityRole="button">
              <Text style={styles.sheetCancelText}>Back to camera</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const FRAME = 268;
const CORNER = 56;
const THICK = 6;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#17191E' },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,15,18,0.35)' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtnOn: { backgroundColor: ui.accent },
  headerTitle: { color: ui.white, fontSize: 18, fontWeight: '700' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  prompt: { color: ui.white, fontSize: 22, fontWeight: '700', textAlign: 'center', lineHeight: 28, marginBottom: 28 },
  frame: { width: FRAME, height: FRAME },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: ui.accent },
  tl: { left: 0, top: 0, borderLeftWidth: THICK, borderTopWidth: THICK, borderTopLeftRadius: 22 },
  tr: { right: 0, top: 0, borderRightWidth: THICK, borderTopWidth: THICK, borderTopRightRadius: 22 },
  bl: { left: 0, bottom: 0, borderLeftWidth: THICK, borderBottomWidth: THICK, borderBottomLeftRadius: 22 },
  br: { right: 0, bottom: 0, borderRightWidth: THICK, borderBottomWidth: THICK, borderBottomRightRadius: 22 },
  scanLine: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: FRAME / 2 - 2,
    height: 3,
    borderRadius: 2,
    backgroundColor: ui.accent,
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', marginTop: 28 },
  hint: { color: '#D5D8DE', fontSize: 15, marginLeft: 8 },
  bottom: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  bottomHint: { color: ui.onDarkMuted, fontSize: 14, textAlign: 'center', marginBottom: 10 },
  manualBtn: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,15,18,0.4)',
  },
  manualText: { color: ui.white, fontSize: 16, fontWeight: '600', marginLeft: 10 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(14,15,18,0.55)' },
  sheet: {
    backgroundColor: ui.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 32,
  },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: ui.ink },
  sheetBody: { fontSize: 15, lineHeight: 22, color: ui.text2, marginTop: 6 },
  sheetInput: {
    height: 60,
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: ui.ink,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
    color: ui.ink,
  },
  sheetBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: ui.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  sheetBtnText: { color: ui.white, fontSize: 17, fontWeight: '700' },
  dim: { opacity: 0.45 },
  sheetCancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  sheetCancelText: { fontSize: 16, fontWeight: '600', color: ui.ink },
});
