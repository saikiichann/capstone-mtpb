import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export default function ConfirmModal({
  visible,
  title,
  message,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  onCancel,
  onConfirm,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.row}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(14,15,18,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', backgroundColor: colors.white, borderRadius: 20, padding: 24, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#0E0F12', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 22, color: '#3A3F4A', textAlign: 'center', marginBottom: 22 },
  row: { flexDirection: 'row', width: '100%' },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D5D8DE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#0E0F12' },
  confirmBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#0E0F12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
