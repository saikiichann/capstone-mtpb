import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import ConfirmModal from '../components/ConfirmModal';
import BottomNav from '../components/BottomNav';
import StatusPill from '../components/StatusPill';
import { ui, greeting, initialsOf, enforcerIdOf } from '../theme/ui';
import { auth, db } from '../firebase';
import { endSession } from '../session';
import { signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { clampStateOf } from '../utils/clampState';
import { toRow, shortTime } from '../utils/violationRow';

/**
 * Home: who is on duty, their latest clamps, and the big Scan button.
 */
export default function ClampDashboardScreen({ navigation, route }) {
  const officerUid = route?.params?.officerUid || auth.currentUser?.uid || null;
  const [officerName, setOfficerName] = useState(
    route?.params?.officerName || 'Officer',
  );
  const [photoUrl, setPhotoUrl] = useState(null);
  const [area, setArea] = useState('Sector 3, Manila');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogout, setShowLogout] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Own profile (name, photo, area) — live, so a new photo shows right away.
  useEffect(() => {
    if (!officerUid) return undefined;
    return onSnapshot(
      doc(db, 'users', officerUid),
      snap => {
        const d = snap.data() || {};
        if (d.name) setOfficerName(d.name);
        setPhotoUrl(d.photoUrl || null);
        if (d.assignedLocation) setArea(d.assignedLocation);
      },
      () => {},
    );
  }, [officerUid]);

  // Own clamps, newest first.
  useEffect(() => {
    if (!officerUid) {
      setLoading(false);
      return undefined;
    }
    const q = query(
      collection(db, 'violations'),
      where('enforcementType', '==', 'clamped'),
      where('officerUid', '==', officerUid),
    );
    return onSnapshot(
      q,
      snap => {
        setRows(snap.docs.map(d => toRow(d.id, d.data())));
        setLoading(false);
      },
      err => {
        console.log('Recent activity failed:', err?.code);
        setLoading(false);
      },
    );
  }, [officerUid]);

  const recent = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => (b.recordedAt || 0) - (a.recordedAt || 0))
        .slice(0, 4)
        .map(r => ({ ...r, state: clampStateOf(r, now) })),
    [rows, now],
  );

  const params = { officerName, officerUid };
  const goScan = () => navigation.navigate('ScanQR', params);
  const goActivity = () => navigation.navigate('ClampActivity', params);
  const goProfile = () => navigation.navigate('EditProfile', params);

  const handleLogout = async () => {
    setShowLogout(false);
    try {
      await endSession();
      await signOut(auth);
    } catch (err) {
      console.log('Logout error:', err?.code);
    }
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ui.ink} />

      {/* Grey behind the header so its rounded bottom corners show. */}
      <View style={styles.headerWrap}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.onDuty}>
              <View style={styles.onDutyDot} />
              <Text style={styles.onDutyText}>On duty</Text>
            </View>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={() => setShowLogout(true)}
              accessibilityRole="button"
              accessibilityLabel="Log out"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="log-out" size={14} color={ui.white} />
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.me}
            onPress={goProfile}
            accessibilityRole="button"
            accessibilityLabel={`Open my profile, ${officerName}`}
          >
            <View style={styles.avatar}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>{initialsOf(officerName)}</Text>
              )}
              <View style={styles.avatarEdit}>
                <Icon name="edit-2" size={13} color={ui.ink} />
              </View>
            </View>
            <View style={styles.meText}>
              <Text style={styles.hello}>{greeting(new Date(now))}</Text>
              <Text style={styles.name} numberOfLines={2}>
                {officerName}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.idChip}>ID {enforcerIdOf(officerUid)}</Text>
                <Icon name="map-pin" size={13} color="#D5D8DE" />
                <Text style={styles.areaText} numberOfLines={1}>
                  {area}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
      >
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <TouchableOpacity
            style={styles.seeAll}
            onPress={goActivity}
            accessibilityRole="button"
          >
            <Text style={styles.seeAllText}>See all</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={ui.ink} />
            <Text style={styles.muted}>Loading your activity…</Text>
          </View>
        ) : recent.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="inbox" size={28} color={ui.muted} />
            <Text style={styles.emptyTitle}>No clamps yet today</Text>
            <Text style={styles.muted}>
              Tap Scan below to record your first violation.
            </Text>
          </View>
        ) : (
          recent.map(r => (
            <TouchableOpacity
              key={r.docId}
              style={styles.row}
              onPress={() =>
                navigation.navigate('ViolationDetails', { record: r })
              }
              accessibilityRole="button"
            >
              <View style={styles.rowMain}>
                <Text style={styles.plate}>{r.plate || '—'}</Text>
                <Text style={styles.rowType} numberOfLines={1}>
                  {r.violation || 'Violation'}
                </Text>
                <Text style={styles.rowMeta}>
                  {r.cin} · {shortTime(r.recordedAt, new Date(now))}
                </Text>
              </View>
              <StatusPill state={r.state} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <BottomNav active="home" onScan={goScan} onActivity={goActivity} />

      <ConfirmModal
        visible={showLogout}
        title="Log out?"
        message="You will need your username and password to sign in again."
        cancelLabel="Stay"
        confirmLabel="Log out"
        onCancel={() => setShowLogout(false)}
        onConfirm={handleLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: ui.ink },
  headerWrap: { backgroundColor: ui.ground },
  header: {
    backgroundColor: ui.ink,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  onDuty: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#1C3A26',
  },
  onDutyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3DDC6E',
    marginRight: 6,
  },
  onDutyText: { color: '#7EE2A0', fontSize: 13, fontWeight: '600' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  logoutText: {
    color: ui.white,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  me: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: ui.white,
    backgroundColor: '#2A2D35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 66, height: 66, borderRadius: 33 },
  avatarText: { color: ui.white, fontSize: 26, fontWeight: '800' },
  avatarEdit: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: ui.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meText: { flex: 1, marginLeft: 16 },
  hello: { color: ui.onDarkMuted, fontSize: 14 },
  name: { color: ui.white, fontSize: 24, fontWeight: '800', marginTop: 2 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  idChip: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#2A2D35',
    color: '#D5D8DE',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginRight: 8,
  },
  areaText: { color: '#D5D8DE', fontSize: 13, marginLeft: 4, flexShrink: 1 },
  body: { flex: 1, backgroundColor: ui.ground },
  bodyContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: ui.ink },
  seeAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  seeAllText: { fontSize: 15, fontWeight: '600', color: ui.ink },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ui.line,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  rowMain: { flex: 1, marginRight: 12 },
  plate: { fontSize: 19, fontWeight: '800', letterSpacing: 0.5, color: ui.ink },
  rowType: { fontSize: 14, color: ui.text2, marginTop: 3 },
  rowMeta: { fontSize: 13, color: ui.muted, marginTop: 3 },
  center: { alignItems: 'center', paddingVertical: 32 },
  muted: { fontSize: 14, color: ui.muted, marginTop: 8, textAlign: 'center' },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: ui.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ui.line,
    padding: 24,
    marginTop: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: ui.ink, marginTop: 8 },
});
