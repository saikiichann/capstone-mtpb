import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, FlatList, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';
import ConfirmModal from '../components/ConfirmModal';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

export default function ClampDashboardScreen({ navigation, route }) {
  // ============================================
  // 1. LAHAT NG HOOKS DITO
  // ============================================
  const [showLogout, setShowLogout] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  const officerName = route?.params?.officerName || 'Unknown Officer';
  const officerUid = route?.params?.officerUid || null;

  // === EFFECT: Recent Activity mula sa violations collection ===
  useEffect(() => {
    if (!officerUid) {
      setLoadingActivity(false);
      return;
    }

    const q = query(
      collection(db, 'violations'),
      where('enforcementType', '==', 'clamped'),
      where('officerUid', '==', officerUid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched = snap.docs.map((d) => {
          const data = d.data();
          const date = data.recordedAt?.toDate?.() || new Date();
          const time = date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

          const isSettled =
            ['paid', 'verified', 'settled'].includes(String(data.paymentStatus || '').toLowerCase()) ||
            ['released', 'approved by oic'].includes(String(data.releaseStatus || '').toLowerCase()) ||
            !!data.paidAt ||
            !!data.releasedAt;

          return {
            id: data.cin || d.id,
            time,
            recordedAt: data.recordedAt || null,
            status: isSettled ? 'SETTLED' : 'UNSETTLED',
            isSettled,
          };
        });

        fetched.sort((a, b) => {
          const dateA = a.recordedAt?.toDate?.()?.getTime?.() || 0;
          const dateB = b.recordedAt?.toDate?.()?.getTime?.() || 0;
          return dateB - dateA;
        });

        setRecentActivity(fetched.slice(0, 3));
        setLoadingActivity(false);
      },
      (err) => {
        console.error('Failed to load recent activity:', err);
        setLoadingActivity(false);
      }
    );

    return () => unsubscribe();
  }, [officerUid]);

  // ============================================
  // 2. HANDLERS
  // ============================================
  const handleLogout = async () => {
    setShowLogout(false);
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const goToScanQR = () => {
    navigation.navigate('ScanQR', { officerName, officerUid });
  };

  const goToActivity = () => {
    navigation.navigate('ClampActivity', { officerName, officerUid });
  };

  const goToEditProfile = () => {
    navigation.navigate('EditProfile', {
      officerUid,
      officerName,
    });
  };

  // ============================================
  // 3. MAIN RENDER
  // ============================================
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      <View style={styles.content}>
        <View style={styles.profileHeader}>
          <View style={styles.topRow}>
            <View style={styles.badgeIcon}>
              <Image
                source={require('../../assets/mtpb_logo.png')}
                style={{ width: 28, height: 28 }}
                resizeMode="contain"
              />
            </View>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={() => setShowLogout(true)}>
                <Icon name="log-out" size={20} color={colors.black} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              <Icon name="user" size={56} color={colors.white} />
            </View>
            <TouchableOpacity style={styles.editBadge} onPress={goToEditProfile}>
              <Icon name="edit-2" size={12} color={colors.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.namePill}>
            <View style={styles.onlineDot} />
            <Text style={styles.nameText}>{officerName}</Text>
          </View>

          <Text style={styles.idText}>
            ENFORCER ID: {officerUid ? officerUid.slice(0, 8).toUpperCase() : '--------'}
          </Text>
          <View style={styles.locationRow}>
            <Icon name="map-pin" size={12} color={colors.gray} />
            <Text style={styles.locationText}>Sector 3 Manila</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.actionCard} onPress={goToScanQR}>
          <View style={styles.actionIconWrap}>
            <MCIcon name="qrcode-scan" size={26} color={colors.black} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionCardTitle}>Scan Clamp QR</Text>
            <Text style={styles.actionCardSubtitle}>Scan QR to Issue Clamping Violation</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.sectionHeaderRow} onPress={goToActivity}>
          <Text style={styles.sectionHeader}>Recent Activity</Text>
          <Icon name="chevron-right" size={18} color={colors.gray} />
        </TouchableOpacity>

        {loadingActivity ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={colors.navy} />
            <Text style={styles.loadingText}>Loading activity...</Text>
          </View>
        ) : recentActivity.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No clamping activity yet.</Text>
          </View>
        ) : (
          <FlatList
            data={recentActivity}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 8 }}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.activityRow}>
                <View style={styles.activityIcon}>
                  <MCIcon name="shield-car" size={20} color={colors.navy} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityId}>{item.id}</Text>
                  <Text
                    style={[
                      styles.activityStatus,
                      { color: item.isSettled ? colors.green : colors.red },
                    ]}
                  >
                    {item.status}
                  </Text>
                </View>
                <Text style={styles.activityTime}>{item.time}</Text>
              </View>
            )}
          />
        )}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={goToActivity}>
          <Icon name="refresh-cw" size={20} color={colors.gray} />
          <Text style={styles.tabLabel}>ACTIVITY</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItemCenter} onPress={goToScanQR}>
          <View style={styles.tabCenterCircle}>
            <MCIcon name="qrcode-scan" size={32} color={colors.white} />
          </View>
          <Text style={styles.tabLabel}>SCAN CLAMP QR</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem}>
          <Icon name="user" size={20} color={colors.gray} />
          <Text style={styles.tabLabel}>DASHBOARD</Text>
        </TouchableOpacity>
      </View>

      <ConfirmModal
        visible={showLogout}
        title="Log Out"
        message="Are you sure you want to logout?"
        cancelLabel="Cancel"
        confirmLabel="Logout"
        onCancel={() => setShowLogout(false)}
        onConfirm={handleLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  content: { flex: 1, paddingHorizontal: 20 },
  profileHeader: { alignItems: 'center', paddingTop: 8 },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarWrap: { marginTop: 12, marginBottom: 12 },
  avatarCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  namePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
    marginRight: 8,
  },
  nameText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.black,
  },
  idText: { fontSize: 12, fontWeight: '600', color: colors.gray, marginTop: 10 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locationText: { fontSize: 12, color: colors.gray, marginLeft: 4 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionCardTitle: { fontSize: 15, fontWeight: '700', color: colors.black },
  actionCardSubtitle: { fontSize: 12, color: colors.gray, marginTop: 2 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 8,
  },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: colors.black },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingText: { marginLeft: 8, fontSize: 12, color: colors.gray },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: { fontSize: 12, color: colors.gray, fontStyle: 'italic' },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityId: { fontSize: 13, fontWeight: '700', color: colors.black },
  activityStatus: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  activityTime: { fontSize: 11, color: colors.gray },
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