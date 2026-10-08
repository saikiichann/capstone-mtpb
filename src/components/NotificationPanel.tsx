import React from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export interface NotificationItem {
  id: string;
  text: string;
  time: string;
  isRead?: boolean;
}

interface NotificationPanelProps {
  visible: boolean;
  onClose: () => void;
  notifications?: NotificationItem[];
}

export default function NotificationPanel({
  visible,
  onClose,
  notifications = [],
}: NotificationPanelProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.card}>
          {/* Header Row */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>Notifications</Text>
          </View>

          {/* List or Empty State */}
          {notifications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No new notifications</Text>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item) => item.id}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <View style={styles.item}>
                  {/* Lahat ng dot ay kulay Green batay sa Figma Design */}
                  <View style={styles.greenDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemText}>{item.text}</Text>
                    <Text style={styles.itemTime}>{item.time}</Text>
                  </View>
                </View>
              )}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxHeight: '60%',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  headerRow: {
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.black,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border || '#EEEEEE',
    marginVertical: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green || '#10B981', // Kulay Green
    marginRight: 10,
    marginTop: 5,
  },
  itemText: {
    fontSize: 12,
    color: colors.black,
    lineHeight: 17,
    fontWeight: '600',
  },
  itemTime: {
    fontSize: 10,
    color: colors.gray,
    marginTop: 4,
  },
  emptyContainer: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: colors.gray,
  },
});