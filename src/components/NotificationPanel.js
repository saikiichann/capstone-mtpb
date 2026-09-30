import React from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';

const DEFAULT_NOTIFICATIONS = [
  { id: '1', text: 'ABC 1235 was verified and in process for release', time: 'Wed, May 20, 05:30 PM' },
  { id: '2', text: 'ABD 1234 was verified and in process for release', time: 'Wed, May 20, 05:30 PM' },
];
export default function NotificationPanel({ visible, onClose, notifications = DEFAULT_NOTIFICATIONS }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Notification</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Icon name="x" size={14} color={colors.white} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <View style={styles.item}>
                <View style={styles.dot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemText}>{item.text}</Text>
                  <Text style={styles.itemTime}>{item.time}</Text>
                </View>
              </View>
            )}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxHeight: '60%', backgroundColor: colors.white, borderRadius: 14, padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '800', color: colors.black },
  closeBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  item: { flexDirection: 'row', alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green, marginRight: 10, marginTop: 5 },
  itemText: { fontSize: 12, color: colors.black, lineHeight: 17 },
  itemTime: { fontSize: 10, color: colors.gray, marginTop: 4 },
});