import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SectionList,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import BottomNav from '../components/BottomNav';
import StatusPill from '../components/StatusPill';
import { ui } from '../theme/ui';
import { auth, db } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  ACTIVITY_CHIPS,
  CLAMP_STATES,
  amountDueOf,
  clampStateOf,
  graceLeftText,
  inChip,
} from '../utils/clampState';
import { toRow, dayLabel, timeOnly, peso } from '../utils/violationRow';

/** Sort button cycles through these. "Needs action" keeps unpaid clamps on top. */
const SORTS = [
  { key: 'action', label: 'Needs action first' },
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
];

const GROUP_TITLES = {
  overdue: 'Overdue',
  unpaid: 'Unpaid',
  'for-verification': 'For verification',
  'for-release': 'For release',
  released: 'Released',
};

/**
 * Activity: every clamp this enforcer recorded.
 * - Chips: All, Overdue, Unpaid, For Verification, For Release (with counts).
 * - Sort: needs action first (default), newest or oldest. Date sorts group by day.
 * - Each row shows the exact state (same as QR Management) and the amount due.
 * - Live; an Unpaid clamp turns Overdue on its own after 24 hours.
 */
export default function ClampActivityScreen({ navigation, route }) {
  const officerUid = route?.params?.officerUid || auth.currentUser?.uid || null;
  const officerName = route?.params?.officerName || 'Officer';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState(route?.params?.chip || 'all');
  const [sortIdx, setSortIdx] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const q = officerUid
      ? query(
          collection(db, 'violations'),
          where('enforcementType', '==', 'clamped'),
          where('officerUid', '==', officerUid)
        )
      : query(collection(db, 'violations'), where('enforcementType', '==', 'clamped'));
    return onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => toRow(d.id, d.data())));
        setLoading(false);
      },
      (err) => {
        console.log('Failed to load violations:', err?.code);
        setLoading(false);
      }
    );
  }, [officerUid]);

  const withState = useMemo(
    () =>
      rows.map((r) => {
        const state = clampStateOf(r, now);
        return { ...r, state, amountDue: amountDueOf(r, state) };
      }),
    [rows, now]
  );

  const counts = useMemo(() => {
    const c = {};
    ACTIVITY_CHIPS.forEach(({ key }) => {
      c[key] = withState.filter((r) => inChip(r.state, key)).length;
    });
    return c;
  }, [withState]);

  const sort = SORTS[sortIdx];

  const { sections, total } = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = withState.filter((r) => {
      if (!inChip(r.state, chip)) return false;
      if (!q) return true;
      return (
        r.plate.toLowerCase().includes(q) ||
        r.cin.toLowerCase().includes(q) ||
        r.clampId.toLowerCase().includes(q) ||
        String(r.address?.street || r.location || '').toLowerCase().includes(q)
      );
    });

    const byDate = (a, b) => (b.recordedAt || 0) - (a.recordedAt || 0);
    if (sort.key === 'oldest') list = list.sort((a, b) => -byDate(a, b));
    else if (sort.key === 'newest') list = list.sort(byDate);
    else
      list = list.sort((a, b) => {
        const d = CLAMP_STATES[a.state].order - CLAMP_STATES[b.state].order;
        return d !== 0 ? d : byDate(a, b);
      });

    const nowDate = new Date(now);
    const out = [];
    list.forEach((r) => {
      const title =
        sort.key === 'action' ? GROUP_TITLES[CLAMP_STATES[r.state].group] : dayLabel(r.recordedAt, nowDate);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(r);
      else out.push({ title, data: [r] });
    });
    return { sections: out, total: list.length };
  }, [withState, chip, search, sort.key, now]);

  const params = { officerName, officerUid };

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>Activity</Text>
      <View style={styles.searchBox}>
        <Icon name="search" size={20} color={ui.text2} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search plate number"
          placeholderTextColor={ui.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Search plate number"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.clearBtn} accessibilityLabel="Clear search">
            <Icon name="x" size={18} color={ui.text2} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ui.ink} />
      {header}

      <View style={styles.body}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsBar}
          contentContainerStyle={styles.chips}
          accessibilityRole="tablist"
        >
          {ACTIVITY_CHIPS.map((c) => {
            const on = chip === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setChip(c.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${c.label}, ${counts[c.key] || 0}`}
              >
                <View style={[styles.chipDot, { backgroundColor: on ? ui.white : c.dot }]} />
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                <Text style={[styles.chipCount, on && styles.chipCountOn]}>{counts[c.key] || 0}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.toolbar}>
          <Text style={styles.resultText}>
            {total} {total === 1 ? 'violation' : 'violations'}
          </Text>
          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setSortIdx((i) => (i + 1) % SORTS.length)}
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${sort.label}. Tap to change.`}
          >
            <Icon name={sort.key === 'action' ? 'alert-circle' : 'calendar'} size={17} color={ui.ink} />
            <Text style={styles.sortText}>{sort.label}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={ui.ink} />
            <Text style={styles.muted}>Loading violations…</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.docId}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.listContent}
            renderSectionHeader={({ section }) => <Text style={styles.groupTitle}>{section.title}</Text>}
            renderItem={({ item }) => {
              const left = item.state === 'unpaid' ? graceLeftText(item, now) : null;
              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => navigation.navigate('ViolationDetails', { record: item })}
                  accessibilityRole="button"
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.plate}>{item.plate || '—'}</Text>
                    <Text style={styles.rowType} numberOfLines={1}>
                      {item.violation || 'Violation'}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.cin} · {timeOnly(item.recordedAt)}
                      {item.clampId ? ` · ${item.clampId}` : ''}
                    </Text>
                    {left && <Text style={styles.rowLeft}>{left} before ₱2,000</Text>}
                  </View>
                  <View style={styles.rowSide}>
                    <StatusPill state={item.state} />
                    <Text style={styles.amount}>{peso(item.amountDue)}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {rows.length === 0
                  ? 'No clamps yet. Tap Scan to record your first violation.'
                  : 'No violations match this filter.'}
              </Text>
            }
          />
        )}
      </View>

      <BottomNav
        active="activity"
        // Go back to the Home already open (navigate would stack a second one).
        onHome={() => navigation.popTo('ClampDashboard', params)}
        onScan={() => navigation.navigate('ScanQR', params)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: ui.ink },
  header: { backgroundColor: ui.ink, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18 },
  title: { fontSize: 28, fontWeight: '800', color: ui.white, marginBottom: 14 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: ui.white,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16, fontWeight: '500', color: ui.ink, paddingVertical: 0 },
  clearBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  body: { flex: 1, backgroundColor: ui.ground },
  chipsBar: { flexGrow: 0, flexShrink: 0 },
  chips: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: ui.field,
    backgroundColor: ui.white,
    marginRight: 8,
    marginBottom: 8,
  },
  chipOn: { backgroundColor: ui.ink, borderColor: ui.ink },
  chipDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  chipText: { fontSize: 14, fontWeight: '600', color: ui.ink },
  chipTextOn: { color: ui.white },
  chipCount: {
    overflow: 'hidden',
    marginLeft: 8,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: ui.ground,
    color: ui.text2,
    fontSize: 12,
    fontWeight: '700',
  },
  chipCountOn: { backgroundColor: ui.white, color: ui.ink },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 2,
  },
  resultText: { fontSize: 14, fontWeight: '600', color: ui.text2 },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: ui.field,
    backgroundColor: ui.white,
  },
  sortText: { marginLeft: 8, fontSize: 14, fontWeight: '600', color: ui.ink },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  groupTitle: {
    marginTop: 16,
    marginBottom: 2,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: ui.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ui.line,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 14,
    marginTop: 10,
  },
  rowMain: { flex: 1, marginRight: 12 },
  plate: { fontSize: 19, fontWeight: '800', letterSpacing: 0.5, color: ui.ink },
  rowType: { fontSize: 14, color: ui.text2, marginTop: 3 },
  rowMeta: { fontSize: 13, color: ui.muted, marginTop: 3 },
  rowLeft: { fontSize: 13, fontWeight: '600', color: '#7A4A00', marginTop: 3 },
  rowSide: { alignItems: 'flex-end' },
  amount: { fontSize: 17, fontWeight: '700', color: ui.ink, marginTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: 14, color: ui.muted, marginTop: 10 },
  empty: { marginVertical: 40, textAlign: 'center', fontSize: 15, color: ui.muted },
});
