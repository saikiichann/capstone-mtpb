import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SectionList, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';
import { listenToViolations } from '../services/violationsService';

interface ViolationRecord {
  id: string;
  clampCode?: string;
  plate?: string;
  make?: string;
  type?: string;
  violation?: string;
  violations?: string[];
  amount?: number | string;
  penalty?: number | string;
  status?: string;
  paymentStatus?: string;
  createdAt?: {
    toDate?: () => Date;
  };
}

interface SectionData {
  title: string;
  data: ViolationRecord[];
}

interface ClampActivityScreenProps {
  navigation: any;
}

export default function ClampActivityScreen({ navigation }: ClampActivityScreenProps) {
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<ViolationRecord[]>([]);

  useEffect(() => {
    const unsubscribe = listenToViolations(setRecords);
    return unsubscribe;
  }, []);

  // Filter base sa Plate, Ticket ID, o Clamp Code
  const filteredRecords = records.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const plateMatch = r.plate?.toLowerCase().includes(q);
    const idMatch = r.id?.toLowerCase().includes(q);
    const clampMatch = r.clampCode?.toLowerCase().includes(q);
    return plateMatch || idMatch || clampMatch;
  });

  // Grouping by Date
  const grouped: SectionData[] = filteredRecords.reduce((sections: SectionData[], r) => {
    const title = r.createdAt?.toDate
      ? r.createdAt.toDate().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      : 'RECENT ENFORCEMENTS';

    const section = sections.find((s) => s.title === title);
    if (section) {
      section.data.push(r);
    } else {
      sections.push({ title, data: [r] });
    }
    return sections;
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clamping Activity Log</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.body}>
        {/* Search Input */}
        <View style={styles.searchRow}>
          <Icon name="search" size={16} color={colors.gray} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search Plate, Ticket ID, or Clamp Code..."
            placeholderTextColor={colors.gray}
            autoCapitalize="characters"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Icon name="x-circle" size={16} color={colors.gray} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.statusHeader}>RECENT CLAMPING RECORDS</Text>

        <SectionList
          sections={grouped}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => {
            const isMotor = item.type?.toLowerCase().includes('motorcycle') || item.type?.toLowerCase().includes('scooter');
            const violationText = item.violations && item.violations.length > 0
              ? item.violations.join(', ')
              : item.violation || 'Clamping Violation';
            const totalPenalty = item.penalty || item.amount || 0;

            return (
              <TouchableOpacity
                style={styles.recordRow}
                onPress={() => navigation.navigate('ViolationDetails', { record: item })}
              >
                <View style={styles.vehicleIconWrap}>
                  <MCIcon name={isMotor ? 'motorbike' : 'car-shield'} size={22} color={colors.navy} />
                </View>

                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.recordId}>{item.id} • {item.plate || 'NO PLATE'}</Text>
                  <Text style={styles.recordViolation} numberOfLines={1}>
                    {violationText}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                  <Text style={styles.amount}>₱ {Number(totalPenalty).toLocaleString()}</Text>
                  <Text style={[styles.status, { color: item.paymentStatus === 'SETTLED' ? colors.green : colors.red }]}>
                    {item.status || 'CLAMPED'}
                  </Text>
                </View>

                <Icon name="chevron-right" size={16} color={colors.gray} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Walang clamping record na tumugma.</Text>}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem}>
          <Icon name="refresh-cw" size={20} color={colors.navy} />
          <Text style={[styles.tabLabel, { color: colors.navy }]}>ACTIVITY</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItemCenter} onPress={() => navigation.navigate('ScanQR')}>
          <View style={styles.tabCenterCircle}>
            <MCIcon name="qrcode-scan" size={32} color={colors.white} />
          </View>
          <Text style={styles.tabLabel}>SCAN CLAMP QR</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('ClampDashboard')}>
          <Icon name="user" size={20} color={colors.gray} />
          <Text style={styles.tabLabel}>DASHBOARD</Text>
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
  body: { flex: 1, backgroundColor: colors.white, paddingHorizontal: 16, paddingTop: 14 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, height: 40, backgroundColor: colors.offWhite },
  searchInput: { flex: 1, fontSize: 13, color: colors.black },
  statusHeader: { fontSize: 11, fontWeight: '700', color: colors.gray, textAlign: 'center', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  sectionHeader: { fontSize: 10, fontWeight: '700', color: colors.gray, letterSpacing: 0.4, marginTop: 12, marginBottom: 6 },
  recordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  vehicleIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.lightGray, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  recordId: { fontSize: 13, fontWeight: '700', color: colors.black },
  recordViolation: { fontSize: 11, color: colors.gray, marginTop: 2 },
  amount: { fontSize: 13, fontWeight: '700', color: colors.black },
  status: { fontSize: 9, fontWeight: '700', marginTop: 2 },
  empty: { fontSize: 12, color: colors.gray, textAlign: 'center', marginTop: 24 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.white },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabItemCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -34 },
  tabCenterCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tabLabel: { fontSize: 9, fontWeight: '600', color: colors.gray, marginTop: 4 },
});