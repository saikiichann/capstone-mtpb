import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, FlatList, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';
import ConfirmModal from '../components/ConfirmModal';
import NotificationPanel from '../components/NotificationPanel';

const RECENT_ACTIVITY = [
  { id: 'CL-202603', time: '5:30 PM', status: 'CLAMPED' },
  { id: 'CL-202602', time: '5:00 PM', status: 'CLAMPED' },
  { id: 'CL-202601', time: '4:30 PM', status: 'CLAMPED' },
];

const CLAMP_NOTIFICATIONS = [
  { id: '1', text: 'ABC 1235 was verified and in process for release', time: 'Wed, May 20, 05:30 PM' },
  { id: '2', text: 'ABD 1234 was verified and in process for release', time: 'Wed, May 20, 05:30 PM' },
];

export default function ClampDashboardScreen({ navigation }) {
  const [showLogout, setShowLogout] = useState(false);
  const [showNotif, setShowNotif] = useState(false);

  const handleLogout = () => {
    setShowLogout(false);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

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
              <TouchableOpacity style={{ marginRight: 16 }} onPress={() => setShowNotif(true)}>
                <Icon name="bell" size={20} color={colors.black} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowLogout(true)}>
                <Icon name="log-out" size={20} color={colors.black} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              <Icon name="user" size={56} color={colors.white} />
            </View>
            <TouchableOpacity style={styles.editBadge}>
              <Icon name="edit-2" size={12} color={colors.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.namePill}>
            <View style={styles.onlineDot} />
            <Text style={styles.nameText}>Juan Dela Cruz</Text>
          </View>

          <Text style={styles.idText}>ENFORCER ID: 00000</Text>
          <View style={styles.locationRow}>
            <Icon name="map-pin" size={12} color={colors.gray} />
            <Text style={styles.locationText}>Sector 3 Manila</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('ScanQR')}>
          <View style={styles.actionIconWrap}>
            <MCIcon name="qrcode-scan" size={26} color={colors.black} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionCardTitle}>Scan Clamp QR</Text>
            <Text style={styles.actionCardSubtitle}>Scan QR to Issue Clamping Violation</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.sectionHeaderRow} onPress={() => navigation.navigate('ClampActivity')}>
          <Text style={styles.sectionHeader}>Recent Activity</Text>
          <Icon name="chevron-right" size={18} color={colors.gray} />
        </TouchableOpacity>

        <FlatList
          data={RECENT_ACTIVITY}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 8 }}
          renderItem={({ item }) => (
            <View style={styles.activityRow}>
              <View style={styles.activityIcon}>
                <MCIcon name="shield-car" size={20} color={colors.navy} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityId}>{item.id}</Text>
                <Text style={styles.activityStatus}>{item.status}</Text>
              </View>
              <Text style={styles.activityTime}>{item.time}</Text>
            </View>
          )}
        />
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('ClampActivity')}>
          <Icon name="refresh-cw" size={20} color={colors.gray} />
          <Text style={styles.tabLabel}>ACTIVITY</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItemCenter} onPress={() => navigation.navigate('ScanQR')}>
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

      <NotificationPanel
        visible={showNotif}
        onClose={() => setShowNotif(false)}
        notifications={CLAMP_NOTIFICATIONS}
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
  activityStatus: { fontSize: 11, fontWeight: '700', color: colors.red, marginTop: 2 },
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