import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import RNPrint from 'react-native-print';
import { colors } from '../theme/colors';

export default function ViolationDetailsScreen({ navigation, route }) {
  const record = route?.params?.record || {};
  const isSettled = record.paymentStatus === 'SETTLED';

  const handlePrint = async () => {
    const photoBlock = record.photoUri
      ? `<img src="${record.photoUri}" style="width:100%; border-radius:8px; margin-top:16px;" />`
      : '';

    const html = `
      <html>
        <body style="font-family: -apple-system, Roboto, sans-serif; padding: 24px; color: #111;">
          <div style="background:${isSettled ? '#3BB54A' : '#E5484D'}; color:#fff; text-align:center; padding:12px; border-radius:8px; font-weight:bold; font-size:16px;">
            ${isSettled ? 'Payment Settled' : 'Payment Unsettled'}
          </div>

          <h2 style="margin-top:24px;">Violation Details</h2>

          <p><strong>Violation Number:</strong> ${record.id || ''}</p>
          <p><strong>Date Issued:</strong> ${record.dateFull || ''}</p>
          <p><strong>Location:</strong> ${record.location || ''}</p>
          <p><strong>Plate Number:</strong> ${record.plate || ''}</p>
          <p><strong>Make / Type / Color:</strong> ${record.make || ''} / ${record.type || ''} / ${record.color || ''}</p>
          <p><strong>Violation/s:</strong> ${record.violation || ''}</p>
          <p><strong>Penalty:</strong> ₱ ${Number(record.amount || 0).toLocaleString()}</p>

          ${photoBlock}
        </body>
      </html>
    `;

    try {
      await RNPrint.print({ html });
    } catch (e) {
      Alert.alert('Print failed', 'Hindi ma-print ang violation details. Subukan ulit.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Violation Details</Text>
        <TouchableOpacity onPress={handlePrint} style={styles.printBtn}>
          <Icon name="printer" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <View style={[styles.banner, { backgroundColor: isSettled ? colors.green : colors.red }]}>
          <Text style={styles.bannerText}>{isSettled ? 'Payment Settled' : 'Payment Unsettled'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Date Issued</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{record.dateFull}</Text>
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>Location</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{record.location}</Text>
          </View>
        </View>

        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={styles.cardTitle}>Violation Details</Text>

          <Text style={styles.smallLabel}>VIOLATION NUMBER</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{record.id}</Text>
          </View>

          <Text style={[styles.smallLabel, { marginTop: 10 }]}>PLATE NUMBER</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{record.plate}</Text>
          </View>

          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>MAKE</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{record.make}</Text>
              </View>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>TYPE</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{record.type}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallLabel}>COLOR</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{record.color}</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.smallLabel, { marginTop: 10 }]}>VIOLATION/S</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{record.violation}</Text>
          </View>

          <Text style={[styles.smallLabel, { marginTop: 10 }]}>PENALTY</Text>
          <Text style={styles.penalty}>₱ {Number(record.amount || 0).toLocaleString()}</Text>

          {record.photoUri ? (
            <Image source={{ uri: record.photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoEmpty} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.navy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 44 },
  backBtn: { padding: 4 },
  printBtn: { padding: 4 },
  headerTitle: { color: colors.white, fontSize: 16, fontWeight: '700' },
  body: { flex: 1, backgroundColor: colors.offWhite },
  banner: { borderRadius: 8, height: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  bannerText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  card: { backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.black, marginBottom: 12 },
  row: { flexDirection: 'row' },
  label: { fontSize: 10, fontWeight: '600', color: colors.gray, marginBottom: 4 },
  smallLabel: { fontSize: 9, fontWeight: '700', color: colors.gray, letterSpacing: 0.4, marginBottom: 4 },
  readOnly: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 36,
    justifyContent: 'center',
    backgroundColor: colors.offWhite,
  },
  readOnlyText: { fontSize: 11, color: colors.black },
  penalty: { fontSize: 15, fontWeight: '700', color: colors.black, marginBottom: 12 },
  photo: { width: '100%', height: 160, borderRadius: 8 },
  photoEmpty: { width: '100%', height: 160, borderRadius: 8, backgroundColor: colors.lightGray },
});