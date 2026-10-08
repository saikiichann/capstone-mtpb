import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SectionList,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';
import { auth, db } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

/**
 * Group violations by date (descending).
 * Each section: { title: "WED, MAY 20, 5:30 PM", data: [...] }
 */
function groupByDate(violations) {
  const groups = {};
  violations.forEach((v) => {
    const key = v.dateFull || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  });
  return Object.entries(groups)
    .sort((a, b) => (b[0] > a[0] ? 1 : -1))
    .map(([title, data]) => ({ title, data }));
}

export default function ClampActivityScreen({ navigation, route }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fallback sa auth.currentUser kung walang officerUid sa params
  const officerUid = route?.params?.officerUid || auth.currentUser?.uid || null;
  const officerName = route?.params?.officerName || 'Officer';

  useEffect(() => {
    // Kung walang officerUid, kunin LAHAT ng clamping violations
    // (walang filter sa officerUid)
    let q;
    if (officerUid) {
      q = query(
        collection(db, 'violations'),
        where('enforcementType', '==', 'clamped'),
        where('officerUid', '==', officerUid)
      );
    } else {
      q = query(
        collection(db, 'violations'),
        where('enforcementType', '==', 'clamped')
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched = snap.docs.map((d) => {
          const data = d.data();
          const date = data.recordedAt?.toDate?.() || new Date();
          const dateFull = [
            date.toLocaleDateString('en-PH', { weekday: 'short' }),
            date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }),
            date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
          ].join(' | ');

          return {
            id: data.cin || d.id,
            dateFull,
            recordedAt: data.recordedAt || null,
            location: data.location || '',
            plate: data.plateNo || '',
            make: data.vehicleMake || '',
            type: data.vehicleType || '',
            color: data.vehicleColor || '',
            violation: data.violationType || '',
            amount: data.fineAmount || 0,
            status: 'CLAMPED',
            paymentStatus: data.paymentStatus || 'Unpaid',
            releaseStatus: data.releaseStatus || 'Pending',
            paidAt: data.paidAt || null,
            releasedAt: data.releasedAt || null,
            totalPaid: data.totalPaid || null,
            photoUri: data.photoUrl || null,
            cin: data.cin,
          };
        });

        // I-sort sa JavaScript base sa recordedAt (descending — pinakabago sa taas)
        fetched.sort((a, b) => {
          const dateA = a.recordedAt?.toDate?.()?.getTime?.() || 0;
          const dateB = b.recordedAt?.toDate?.()?.getTime?.() || 0;
          return dateB - dateA;
        });

        setViolations(fetched);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load violations:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [officerUid]);

  const filtered = violations.filter((r) =>
    r.plate.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );
  const sections = groupByDate(filtered);

  if (loading) {
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

        <View style={[styles.body, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={styles.loadingText}>Loading violations...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search Plate Number"
            placeholderTextColor={colors.gray}
          />
        </View>

        <Text style={styles.statusHeader}>CLAMPED</Text>

        {violations.length === 0 ? (
          <Text style={styles.empty}>No clamping violations yet. Scan a QR code to create one.</Text>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionHeader}>{section.title}</Text>
            )}
            renderItem={({ item }) => {
              // Kumpletong settled check
              const isSettled =
                ['paid', 'verified', 'settled'].includes(String(item.paymentStatus || '').toLowerCase()) ||
                ['released', 'approved by oic'].includes(String(item.releaseStatus || '').toLowerCase()) ||
                !!item.paidAt ||
                !!item.releasedAt;

              return (
                <TouchableOpacity
                  style={styles.recordRow}
                  onPress={() => navigation.navigate('ViolationDetails', { record: item })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recordId}>{item.id}</Text>
                    <Text style={styles.recordViolation}>{item.violation}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                    <Text style={styles.amount}>₱ {Number(item.amount).toLocaleString()}</Text>
                    <Text style={[styles.status, { color: isSettled ? colors.green : colors.red }]}>
                      {isSettled ? 'SETTLED' : 'UNSETTLED'}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={16} color={colors.gray} />
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No records match your search.</Text>}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem}>
          <Icon name="refresh-cw" size={20} color={colors.black} />
          <Text style={styles.tabLabel}>ACTIVITY</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItemCenter}
          onPress={() => navigation.navigate('ScanQR', { officerName, officerUid })}
        >
          <View style={styles.tabCenterCircle}>
            <MCIcon name="qrcode-scan" size={32} color={colors.white} />
          </View>
          <Text style={styles.tabLabel}>SCAN CLAMP QR</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.navigate('ClampDashboard', { officerName, officerUid })}
        >
          <Icon name="user" size={20} color={colors.gray} />
          <Text style={styles.tabLabel}>DASHBOARD</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.navy },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 44,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: colors.white, fontSize: 16, fontWeight: '700' },
  body: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  loadingText: { marginTop: 12, color: colors.gray, fontSize: 13 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.black },
  statusHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray,
    textAlign: 'center',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 6,
  },
  sectionHeader: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.gray,
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 6,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  recordId: { fontSize: 14, fontWeight: '700', color: colors.black },
  recordViolation: { fontSize: 11, color: colors.gray, marginTop: 2 },
  amount: { fontSize: 13, fontWeight: '700', color: colors.black },
  status: { fontSize: 9, fontWeight: '700', marginTop: 2 },
  empty: {
    fontSize: 12,
    color: colors.gray,
    textAlign: 'center',
    marginTop: 24,
    fontStyle: 'italic',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: colors.white,
  },
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