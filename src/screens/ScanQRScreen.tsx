import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { Camera } from 'react-native-camera-kit';
import { colors } from '../theme/colors';

interface ScanQRScreenProps {
  navigation: any;
}

export default function ScanQRScreen({ navigation }: ScanQRScreenProps) {
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [scanned, setScanned] = useState<boolean>(false);

  // Helper function para mag-extract ng Clamp ID mula sa Vercel PWA URL o direct string
  const extractClampId = (rawData: string) => {
    if (!rawData) return '';

    try {
      // 1. Kung buong PWA URL ang na-scan (e.g., https://mtpb-violators-pwa.vercel.app/verify-email?clamp_id=CLMP-411006)
      if (rawData.includes('mtpb-violators-pwa.vercel.app') || rawData.includes('http')) {
        const queryString = rawData.split('?')[1];
        if (queryString) {
          const urlParams = new URLSearchParams(queryString);
          const extracted = urlParams.get('clamp_id') || urlParams.get('clampId');
          if (extracted) return extracted;
        }
      }

      // 2. Fallback RegEx para sa CLMP- prefix (e.g., CLMP-411006)
      const match = rawData.match(/CLMP-[A-Za-z0-9]+/i);
      if (match) {
        return match[0].toUpperCase();
      }

      // 3. Kung plain text o iba pang URL path format
      if (rawData.includes('/')) {
        const parts = rawData.split('/');
        return parts[parts.length - 1];
      }

      return rawData;
    } catch (error) {
      return rawData;
    }
  };

  const onReadCode = (event: any) => {
    if (scanned) return;
    setScanned(true);

    const rawValue = event?.nativeEvent?.codeStringValue || '';
    const parsedId = extractClampId(rawValue);

    if (parsedId) {
      // Ipasa ang exact parsed CLMP ID sa ClampingDetails Screen
      navigation.navigate('ClampingDetails', {
        clampId: parsedId,
        clampCode: parsedId,
        rawQrData: rawValue
      });
      setTimeout(() => setScanned(false), 1500);
    } else {
      Alert.alert(
        "Invalid QR Code",
        "Walang nahanap na valid na Clamp ID sa na-scan na QR.",
        [{ text: "OK", onPress: () => setScanned(false) }]
      );
    }
  };

  // Function para sa Testing Button kapag walang ma-scan na physical QR
  const handleTestBypass = () => {
    const mockId = `CLMP-${Math.floor(100000 + Math.random() * 900000)}`;
    navigation.navigate('ClampingDetails', {
      clampId: mockId,
      clampCode: mockId,
      rawQrData: `https://mtpb-violators-pwa.vercel.app/verify-email?clamp_id=${mockId}`
    });
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

        {/* Test Mode Button */}
        <TouchableOpacity style={styles.primaryBtn} onPress={handleTestBypass}>
          <Text style={styles.primaryBtnText}>⚡ Bypass & Test Scan</Text>
        </TouchableOpacity>

        {/* Flashlight Toggle */}
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