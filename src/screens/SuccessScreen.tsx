import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';

interface SuccessScreenProps {
  navigation: any;
  route?: {
    params?: {
      violationNo?: string;
      dateIssued?: string;
      dashboardRoute?: string;
    };
  };
}

export default function SuccessScreen({ navigation, route }: SuccessScreenProps) {
  const violationNo = route?.params?.violationNo || 'IM-000000';
  const dateIssued = route?.params?.dateIssued || '';
  const dashboardRoute = route?.params?.dashboardRoute || 'ImpoundDashboard';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      <View style={styles.body}>
        <View style={styles.checkCircle}>
          <Icon name="check" size={64} color={colors.green} />
        </View>

        <Text style={styles.title}>VIOLATION SUBMITTED</Text>

        <Text style={styles.violationNo}>Violation No. {violationNo}</Text>
        <Text style={styles.date}>{dateIssued}</Text>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: dashboardRoute }] })}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  checkCircle: { width: 150, height: 150, borderRadius: 75, borderWidth: 8, borderColor: colors.green, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  title: { fontSize: 16, fontWeight: '800', color: colors.black, letterSpacing: 0.5, marginBottom: 40 },
  violationNo: { fontSize: 14, fontWeight: '700', color: colors.black, marginBottom: 4 },
  date: { fontSize: 13, color: colors.black, marginBottom: 60 },
  doneBtn: { width: '100%', backgroundColor: colors.black, borderRadius: 10, height: 50, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});