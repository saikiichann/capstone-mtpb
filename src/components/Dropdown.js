import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';

export default function Dropdown({ value, options, onSelect, placeholder = 'Select', large = false, label }) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <TouchableOpacity
        style={[styles.field, large && styles.fieldLarge]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${value || placeholder}` : undefined}
      >
        <Text
          numberOfLines={1}
          style={[styles.fieldText, large && styles.fieldTextLarge, !value && styles.placeholder]}
        >
          {value || placeholder}
        </Text>
        <Icon name="chevron-down" size={large ? 20 : 16} color={large ? '#3A3F4A' : colors.gray} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{item}</Text>
                  {value === item && <Icon name="check" size={16} color={colors.green} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 36,
    backgroundColor: colors.white,
  },
  fieldText: { fontSize: 12, color: colors.black, flex: 1, marginRight: 6 },
  // Large: the redesign's fields (56 px tall, 16 px text) for outdoor use.
  fieldLarge: {
    height: 56,
    borderWidth: 1.5,
    borderColor: '#D5D8DE',
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  fieldTextLarge: { fontSize: 16, fontWeight: '500', color: '#0E0F12' },
  placeholder: { color: '#5B616E' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  sheet: { backgroundColor: colors.white, borderRadius: 12, maxHeight: 320, paddingVertical: 8 },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  optionText: { fontSize: 16, color: colors.black },
});