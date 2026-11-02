import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { CLAMP_STATES } from '../utils/clampState';

/** Coloured status label (text + colour, so it never relies on colour alone). */
export default function StatusPill({ state, large = false }) {
  const st = CLAMP_STATES[state] || CLAMP_STATES.unpaid;
  return (
    <Text
      style={[
        styles.pill,
        large && styles.large,
        { backgroundColor: st.bg, color: st.color },
      ]}
    >
      {st.chip === 'Ready' ? 'Ready for Release' : st.chip}
    </Text>
  );
}

const styles = StyleSheet.create({
  pill: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: '700',
  },
  large: { fontSize: 14, paddingHorizontal: 12, paddingVertical: 7 },
});
