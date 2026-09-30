import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SectionList, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';

const DATA = [
  { title: 'WED, MAY 20, 5:30 PM', data: [{ id: 'CL-202603', dateFull: 'Wed | May 20, 2026 | 5:30 PM', location: 'Sector 1 - Sample Street 1', plate: 'ABC 1235', make: 'Honda', type: 'Sedan', color: 'Black', violation: 'Obstruction', amount: 900, status: 'CLAMPED', paymentStatus: 'SETTLED' }] },
  { title: 'WED, MAY 20, 5:00 PM', data: [{ id: 'CL-202602', dateFull: 'Wed | May 20, 2026 | 5:00 PM', location: 'Sector 1 - Sample Street 1', plate: 'ABE 1245', make: 'Honda', type: 'Sedan', color: 'Black', violation: 'Obstruction', amount: 900, status: 'CLAMPED', paymentStatus: 'UNSETTLED' }] },
  { title: 'WED, MAY 20, 4:30 PM', data: [{ id: 'CL-202601', dateFull: 'Wed | May 20, 2026 | 4:30 PM', location: 'Sector 1 - Sample Street 1', plate: 'EFG 1235', make: 'Honda', type: 'Sedan', color: 'Black', violation: 'Obstruction', amount: 900, status: 'CLAMPED', paymentStatus: 'UNSETTLED' }] },
];

export default function ClampActivityScreen({ navigation }) {
  const [query, setQuery] = useState('');

  const sections = DATA.map((s) => ({
    ...s,
    data: s.data.filter((r) => r.plate.toLowerCase().includes(query.trim().toLowerCase())),
  })).filter((s) => s.data.length > 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activity</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.searchRow}>
          <Icon name="search" size={16} color={colors.gray} style={{ marginRight: 8 }} />
          <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search Plate Number" placeholderTextColor={colors.gray} />
        </View>

        <Text style={styles.statusHeader}>CLAMPED</Text>

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.recordRow} onPress={() => navigation.navigate('ViolationDetails', { record: item })}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recordId}>{item.id}</Text>
                <Text style={styles.recordViolation}>{item.violation}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                <Text style={styles.amount}>₱ {item.amount.toLocaleString()}</Text>
                <Text style={[styles.status, { color: colors.red }]}>{item.status}</Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.gray} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Walang record na tumugma.</Text>}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem}>
          <Icon name="refresh-cw" size={20} color={colors.black} />
          <Text style={styles.tabLabel}>ACTIVITY</Text>
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
  searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, fontSize: 13, color: colors.black },
  statusHeader: { fontSize: 11, fontWeight: '700', color: colors.gray, textAlign: 'center', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  sectionHeader: { fontSize: 9, fontWeight: '700', color: colors.gray, letterSpacing: 0.4, marginTop: 12, marginBottom: 6 },
  recordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12 },
  recordId: { fontSize: 14, fontWeight: '700', color: colors.black },
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