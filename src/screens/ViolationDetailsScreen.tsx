import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import RNPrint from 'react-native-print';
import { colors } from '../theme/colors';

interface ViolationRecord {
  id?: string;
  ticketNumber?: string;
  clampCode?: string;
  paymentStatus?: string;
  status?: string;
  dateFull?: string;
  createdAt?: any;
  location?: string;
  plate?: string;
  make?: string;
  type?: string;
  color?: string;
  violation?: string;
  violations?: string[];
  amount?: number | string;
  penalty?: number | string;
  photoUri?: string;
  photoLocalUri?: string;
  photoUrl?: string;
}

interface ViolationDetailsScreenProps {
  navigation: any;
  route?: {
    params?: {
      record?: ViolationRecord;
    };
  };
}

export default function ViolationDetailsScreen({ navigation, route }: ViolationDetailsScreenProps) {
  const record: ViolationRecord = route?.params?.record || {};

  // Status check
  const isSettled = record.paymentStatus === 'SETTLED' || record.status === 'RELEASED';

  // Fallbacks para sa Ticket ID, Photo, at Penalty
  const ticketId = record.id || record.ticketNumber || 'N/A';
  const totalPenalty = Number(record.penalty || record.amount || 0);
  const photoPath = record.photoUri || record.photoLocalUri || record.photoUrl;

  // Format Violations (String o Array)
  const violationDisplay = record.violations && record.violations.length > 0
    ? record.violations.join(', ')
    : record.violation || 'Clamping Violation';

  // Format Date (Firestore Timestamp / Date / String)
  const formattedDate = () => {
    if (record.dateFull) return record.dateFull;
    if (record.createdAt?.toDate) {
      return record.createdAt.toDate().toLocaleString('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    }
    if (typeof record.createdAt === 'string') return record.createdAt;
    return 'N/A';
  };

  const handlePrint = async () => {
    const photoBlock = photoPath
      ? `<div style="text-align:center; margin-top:16px;">
           <img src="${photoPath}" style="max-width:100%; height:auto; border-radius:8px; border:1px solid #ccc;" />
         </div>`
      : '';

    const html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #111; line-height: 1.4; }
            .badge { background:${isSettled ? '#3BB54A' : '#E5484D'}; color:#fff; text-align:center; padding:10px; border-radius:6px; font-weight:bold; font-size:14px; text-transform:uppercase; }
            .header-title { text-align:center; margin-top:15px; margin-bottom:20px; font-size:18px; border-bottom:2px solid #eee; padding-bottom:10px; }
            .item-row { margin-bottom: 8px; font-size: 13px; }
            .label { font-weight: bold; color: #555; }
            .penalty-box { font-size: 18px; font-weight: bold; color: #E5484D; margin-top: 10px; }
            .footer { text-align: center; font-size: 10px; color: #777; margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="badge">
            ${isSettled ? 'PAYMENT SETTLED / UNCLAMPED' : 'PAYMENT UNSETTLED / CLAMPED'}
          </div>

          <h2 class="header-title">MANILA TRAFFIC & PARKING BUREAU<br/><span style="font-size:12px; font-weight:normal;">Clamping Violation Ticket Summary</span></h2>

          <div class="item-row"><span class="label">Ticket Number:</span> ${ticketId}</div>
          ${record.clampCode ? `<div class="item-row"><span class="label">Clamp Code:</span> ${record.clampCode}</div>` : ''}
          <div class="item-row"><span class="label">Date Issued:</span> ${formattedDate()}</div>
          <div class="item-row"><span class="label">Location:</span> ${record.location || 'N/A'}</div>
          <div class="item-row"><span class="label">Plate Number:</span> ${record.plate || 'NO PLATE'}</div>
          <div class="item-row"><span class="label">Make / Type / Color:</span> ${record.make || 'N/A'} / ${record.type || 'N/A'} / ${record.color || 'N/A'}</div>
          <div class="item-row"><span class="label">Violation/s:</span> ${violationDisplay}</div>

          <div class="penalty-box">
            Penalty Amount: ₱ ${totalPenalty.toLocaleString()}
          </div>

          ${photoBlock}

          <div class="footer">
            Official MTPB Clamping Record • City of Manila
          </div>
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

      {/* Header */}
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
        {/* Status Banner */}
        <View style={[styles.banner, { backgroundColor: isSettled ? colors.green : colors.red }]}>
          <Text style={styles.bannerText}>
            {isSettled ? 'PAYMENT SETTLED' : 'PAYMENT UNSETTLED / CLAMPED'}
          </Text>
        </View>

        {/* Date & Location Card */}
        <View style={styles.card}>
          <Text style={styles.label}>Date Issued</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{formattedDate()}</Text>
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>Location</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{record.location || 'N/A'}</Text>
          </View>
        </View>

        {/* Vehicle & Violation Card */}
        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={styles.cardTitle}>Violation Details</Text>

          <Text style={styles.smallLabel}>VIOLATION TICKET NO.</Text>
          <View style={styles.readOnly}>
            <Text style={[styles.readOnlyText, { fontWeight: '700' }]}>{ticketId}</Text>
          </View>

          {record.clampCode && (
            <>
              <Text style={[styles.smallLabel, { marginTop: 10 }]}>CLAMP CODE</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{record.clampCode}</Text>
              </View>
            </>
          )}

          <Text style={[styles.smallLabel, { marginTop: 10 }]}>PLATE NUMBER</Text>
          <View style={styles.readOnly}>
            <Text style={[styles.readOnlyText, { fontWeight: '700' }]}>{record.plate || 'NO PLATE'}</Text>
          </View>

          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>MAKE</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{record.make || 'N/A'}</Text>
              </View>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.smallLabel}>TYPE</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{record.type || 'N/A'}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallLabel}>COLOR</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{record.color || 'N/A'}</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.smallLabel, { marginTop: 10 }]}>VIOLATION/S</Text>
          <View style={[styles.readOnly, { height: 'auto', minHeight: 36, paddingVertical: 8 }]}>
            <Text style={styles.readOnlyText}>{violationDisplay}</Text>
          </View>

          <Text style={[styles.smallLabel, { marginTop: 10 }]}>TOTAL PENALTY</Text>
          <Text style={styles.penalty}>₱ {totalPenalty.toLocaleString()}</Text>

          {/* Photo Proof Display */}
          {photoPath ? (
            <Image source={{ uri: photoPath }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={styles.photoEmpty}>
              <Icon name="image" size={28} color={colors.gray} />
              <Text style={styles.photoEmptyText}>No Photo Proof Captured</Text>
            </View>
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
  bannerText: { color: colors.white, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
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
  penalty: { fontSize: 16, fontWeight: '800', color: colors.red, marginBottom: 12 },
  photo: { width: '100%', height: 180, borderRadius: 8, marginTop: 4 },
  photoEmpty: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    backgroundColor: colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  photoEmptyText: { fontSize: 11, color: colors.gray, marginTop: 6 },
});