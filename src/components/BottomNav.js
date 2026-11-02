import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ui } from '../theme/ui';

/**
 * Home · Scan · Activity. The amber Scan button sits in the middle and
 * stands out, because scanning a clamp is the main job.
 */
export default function BottomNav({ active, onHome, onScan, onActivity }) {
  const tab = (key, label, icon, onPress) => {
    const on = active === key;
    return (
      <TouchableOpacity
        style={styles.tab}
        onPress={on ? undefined : onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={label}
      >
        <Icon name={icon} size={26} color={on ? ui.ink : ui.muted} />
        <Text style={[styles.label, on && styles.labelOn]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.bar}>
      {tab('home', 'Home', 'home', onHome)}
      <TouchableOpacity
        style={styles.scanWrap}
        onPress={onScan}
        accessibilityRole="button"
        accessibilityLabel="Scan clamp QR"
      >
        <View style={styles.scanCircle}>
          <MCIcon name="qrcode-scan" size={32} color={ui.ink} />
        </View>
        <Text style={[styles.label, styles.labelOn]}>Scan</Text>
      </TouchableOpacity>
      {tab('activity', 'Activity', 'list', onActivity)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 84,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.white,
    borderTopWidth: 1,
    borderTopColor: ui.line,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  label: { fontSize: 13, fontWeight: '600', color: ui.muted, marginTop: 4 },
  labelOn: { color: ui.ink, fontWeight: '700' },
  scanWrap: { flex: 1, alignItems: 'center', marginTop: -40 },
  scanCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ui.accent,
    borderWidth: 5,
    borderColor: ui.white,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
