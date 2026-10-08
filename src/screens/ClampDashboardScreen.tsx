import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { colors } from '../theme/colors';
import ConfirmModal from '../components/ConfirmModal';
import NotificationPanel from '../components/NotificationPanel';

interface ActivityItem {
  id: string;
  plate: string;
  type: string;
  time: string;
  status: string;
}

interface NotificationItem {
  id: string;
  text: string;
  time: string;
  isRead?: boolean;
}

interface ClampDashboardScreenProps {
  navigation: any;
}

export default function ClampDashboardScreen({ navigation }: ClampDashboardScreenProps) {
  const [showLogout, setShowLogout] = useState(false);
  const [showNotif, setShowNotif] = useState(false);

  // Red dot indicator state (Nawawala kapag na-click)
  const [hasUnread, setHasUnread] = useState(false);

  // Dynamic States
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [userProfile, setUserProfile] = useState({
    name: 'Loading...',
    enforcerId: '00000',
    sector: 'Sector 3 Manila',
  });

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // 1. Fetch Profile Info ng Enforcer
    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserProfile({
            name: data.name || 'Enforcer',
            enforcerId: data.enforcerId || '00000',
            sector: data.sector || 'Sector 3 Manila',
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      }
    };

    fetchProfile();

    // 2. Real-time Listener sa clampViolations
    const colRef = collection(db, 'clampViolations');

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        try {
          const fetchedActivities: any[] = [];
          const fetchedNotifs: (NotificationItem & { rawDate: Date })[] = [];

          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const plateNumber = data.plate || 'NO PLATE';

            let rawDate = new Date(0);
            let timeFormatted = 'Just now';
            let fullDateFormatted = 'Just now';

            if (data.createdAt?.toDate) {
              rawDate = data.createdAt.toDate();
              timeFormatted = rawDate.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              fullDateFormatted = rawDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
            }

            // A. Recent Activity List Item
            fetchedActivities.push({
              id: data.clampCode || data.id || `CL-${docSnap.id.substring(0, 6).toUpperCase()}`,
              plate: plateNumber,
              type: data.type || 'Vehicle',
              status: data.paymentStatus || data.status || 'CLAMPED',
              time: timeFormatted,
              rawDate: rawDate,
            });

            // B. Dynamic Notifications List
            const isSettled =
              data.paymentStatus === 'PAID' ||
              data.paymentStatus === 'VERIFIED' ||
              data.status === 'RELEASED';

            if (isSettled) {
              fetchedNotifs.push({
                id: `notif-paid-${docSnap.id}`,
                text: `${plateNumber} was verified and in process for release`,
                time: fullDateFormatted,
                rawDate: rawDate,
                isRead: false,
              });
            } else {
              fetchedNotifs.push({
                id: `notif-clamp-${docSnap.id}`,
                text: `${plateNumber} was successfully clamped`,
                time: fullDateFormatted,
                rawDate: rawDate,
                isRead: false,
              });
            }
          });

          // Sort Mula Pinakabago Papuntang Pinakaluma
          fetchedActivities.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
          fetchedNotifs.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

          // Kapag may pumasok na panibagong listahan sa snapshot, sindihan ang red dot badge
          if (snapshot.docChanges().length > 0) {
            setHasUnread(true);
          }

          setActivities(fetchedActivities.slice(0, 5));
          setNotifications(fetchedNotifs);
        } catch (err) {
          console.error('Snapshot parsing error:', err);
        } finally {
          setLoadingActivities(false);
        }
      },
      (error) => {
        console.error('Firestore Listener Error:', error);
        setLoadingActivities(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleOpenNotif = () => {
    setShowNotif(true);
    setHasUnread(false); // Awtomatikong tatanggalin ang red dot sa dashboard pagnapindot na
  };

  const handleLogout = () => {
    setShowLogout(false);
    auth.signOut();
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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                style={{ marginRight: 16, padding: 4 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={handleOpenNotif}
              >
                <Icon name="bell" size={20} color={colors.black} />
                {/* Ginagamit na rito ang hasUnread state sa halip na notifications.length */}
                {hasUnread && (
                  <View style={styles.notifBadgeDot} pointerEvents="none" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={{ padding: 4 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => setShowLogout(true)}
              >
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
            <Text style={styles.nameText}>{userProfile.name}</Text>
          </View>

          <Text style={styles.idText}>ENFORCER ID: {userProfile.enforcerId}</Text>
          <View style={styles.locationRow}>
            <Icon name="map-pin" size={12} color={colors.gray} />
            <Text style={styles.locationText}>{userProfile.sector}</Text>
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

        {loadingActivities ? (
          <ActivityIndicator size="small" color={colors.black} style={{ marginTop: 20 }} />
        ) : activities.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No recent clamping activity.</Text>
          </View>
        ) : (
          <FlatList<ActivityItem>
            data={activities}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 8 }}
            renderItem={({ item }) => {
              const isMotor =
                item.type.toLowerCase().includes('motorcycle') ||
                item.type.toLowerCase().includes('scooter');
              return (
                <View style={styles.activityRow}>
                  <View style={styles.activityIcon}>
                    <MCIcon
                      name={isMotor ? 'motorbike' : 'car-shield'}
                      size={20}
                      color={colors.navy}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityId}>{item.id} • {item.plate}</Text>
                    <Text style={styles.activityStatus}>{item.status}</Text>
                  </View>
                  <Text style={styles.activityTime}>{item.time}</Text>
                </View>
              );
            }}
          />
        )}
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
          <Icon name="user" size={20} color={colors.navy} />
          <Text style={[styles.tabLabel, { color: colors.navy }]}>DASHBOARD</Text>
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
        notifications={notifications}
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
  notifBadgeDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
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
  emptyContainer: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 12, color: colors.gray },
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