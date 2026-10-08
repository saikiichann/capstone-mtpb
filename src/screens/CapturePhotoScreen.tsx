import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { Camera } from 'react-native-camera-kit';
import { colors } from '../theme/colors';

interface CapturePhotoScreenProps {
  navigation: any;
  route: {
    params?: {
      returnTo?: string;
      extraParams?: Record<string, any>;
    };
  };
}

export default function CapturePhotoScreen({ navigation, route }: CapturePhotoScreenProps) {
  const cameraRef = useRef<any>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [busy, setBusy] = useState(false);

  // Defaulted na sa ClampingDetails para sa clamping module
  const returnTo = route?.params?.returnTo || 'ClampingDetails';
  const extraParams = route?.params?.extraParams || {};

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const image = await cameraRef.current?.capture();

      // Saluhin kung uri o path ang ibinalik ng camera kit
      let rawUri = image?.uri || image?.path;

      if (rawUri) {
        // Siguraduhing may file:// prefix kung Android local path para mag-render sa Image component
        if (!rawUri.startsWith('file://') && !rawUri.startsWith('http')) {
          rawUri = `file://${rawUri}`;
        }

        navigation.navigate(returnTo, {
          ...extraParams,
          photoUri: rawUri
        });
      } else {
        throw new Error('URI not found');
      }
    } catch (e: any) {
      Alert.alert('Capture failed', 'Hindi nakuha ang larawan. Subukan ulit.');
    } finally {
      setBusy(false);
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
        <Text style={styles.headerTitle}>Capture Photo Proof</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.frame}>
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              cameraType="back"
              flashMode={flashOn ? 'on' : 'off'}
            />
          </View>
          <Text style={styles.caption}>Capture clamped vehicle photo with wheel lock / plate for proof!</Text>
        </View>

        {/* Capture Button */}
        <TouchableOpacity style={styles.primaryBtn} onPress={capture} disabled={busy}>
          <Text style={styles.primaryBtnText}>{busy ? 'Capturing Photo...' : 'Take Photo'}</Text>
        </TouchableOpacity>

        {/* Flash Toggle */}
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.navy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 44 },
  backBtn: { padding: 4 },
  headerTitle: { color: colors.white, fontSize: 16, fontWeight: '700' },
  body: { flex: 1, backgroundColor: colors.offWhite, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 24 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, alignItems: 'center' },
  frame: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.black },
  caption: { fontSize: 12, color: colors.gray, marginTop: 12, textAlign: 'center' },
  primaryBtn: { backgroundColor: colors.black, borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  primaryBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: colors.black },
});