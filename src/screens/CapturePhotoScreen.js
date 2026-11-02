import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { Camera } from 'react-native-camera-kit';
import { useIsFocused } from '@react-navigation/native';
import { ui } from '../theme/ui';

/**
 * Full-screen camera.
 * params: returnTo (screen to go back to, default ClampingDetails),
 *         paramName (photoUri by default), front (selfie camera), title, hint.
 * It goes BACK to the screen that opened it (popTo + merge), so whatever was
 * typed there (plate, violations) is kept.
 */
export default function CapturePhotoScreen({ navigation, route }) {
  const cameraRef = useRef(null);
  const [flashOn, setFlashOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const focused = useIsFocused();
  // Give the camera a moment to open and set its exposure; a photo taken
  // right away can come out black on older phones.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!focused) {
      setReady(false);
      return undefined;
    }
    const t = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(t);
  }, [focused]);

  const returnTo = route?.params?.returnTo || 'ClampingDetails';
  const paramName = route?.params?.paramName || 'photoUri';
  const front = route?.params?.front === true;
  const title = route?.params?.title || 'Evidence photo';
  const hint = route?.params?.hint || 'Show the plate number and the clamp in one photo.';

  const capture = async () => {
    if (busy || !ready || !cameraRef.current) return;
    setBusy(true);
    try {
      const image = await cameraRef.current.capture();
      console.log('[camera] photo:', JSON.stringify(image));
      navigation.popTo(returnTo, { [paramName]: image.uri }, { merge: true });
    } catch (e) {
      Alert.alert('Photo not taken', 'The camera could not take the photo. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#17191E" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.roundBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Icon name="x" size={22} color={ui.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        {front ? (
          <View style={styles.roundBtnSpacer} />
        ) : (
          <TouchableOpacity
            style={[styles.roundBtn, flashOn && styles.roundBtnOn]}
            onPress={() => setFlashOn((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={flashOn ? 'Turn off flash' : 'Turn on flash'}
          >
            <Icon name="zap" size={22} color={flashOn ? ui.ink : ui.white} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.frame}>
        {focused && (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            cameraType={front ? 'front' : 'back'}
            flashMode={flashOn ? 'on' : 'off'}
          />
        )}
      </View>

      <Text style={styles.hint}>{hint}</Text>

      <View style={styles.bottom}>
        <TouchableOpacity
          style={styles.shutter}
          onPress={capture}
          disabled={busy || !ready}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          accessibilityState={{ disabled: busy || !ready }}
        >
          {busy || !ready ? <ActivityIndicator color={ui.white} /> : <View style={styles.shutterInner} />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#17191E' },
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
  roundBtnSpacer: { width: 48, height: 48 },
  headerTitle: { color: ui.white, fontSize: 18, fontWeight: '700' },
  frame: { flex: 1, marginHorizontal: 12, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  hint: { color: '#D5D8DE', fontSize: 15, textAlign: 'center', paddingHorizontal: 24, marginTop: 14 },
  bottom: { alignItems: 'center', paddingVertical: 20 },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 5,
    borderColor: ui.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: ui.accent },
});
