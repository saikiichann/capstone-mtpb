import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { auth } from './src/firebase';
import { endSession, setRevokeHandler } from './src/session';
import { LOGIN, NOTICES, decideStart, shiftOver, waitForUser } from './src/boot';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from './src/screens/LoginScreen';
import ClampDashboardScreen from './src/screens/ClampDashboardScreen';
import ClampingDetailsScreen from './src/screens/ClampingDetailsScreen';
import ScanQRScreen from './src/screens/ScanQRScreen';
import CapturePhotoScreen from './src/screens/CapturePhotoScreen';
import ClampActivityScreen from './src/screens/ClampActivityScreen';
import ViolationDetailsScreen from './src/screens/ViolationDetailsScreen';
import SuccessScreen from './src/screens/SuccessScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>();

type Start = {
  route: string;
  params?: { officerName: string; officerUid: string };
  notice: string | null;
};

const showNotice = (key: string | null) => {
  const message = key ? (NOTICES as Record<string, string[]>)[key] : null;
  if (message) Alert.alert(message[0], message[1]);
};

export default function App() {
  // First screen: Home if still logged in for this shift, else Login.
  const [start, setStart] = useState<Start | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const user = await waitForUser();
      const first: Start = await decideStart(user).catch(() => LOGIN);
      if (!alive) return;
      setStart(first);
      showNotice(first.notice);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Shift over while the app is open (checked every minute and whenever
  // the app comes back to the front): log out and go to Login.
  useEffect(() => {
    if (!start) return undefined;
    let busy = false;
    const check = async () => {
      if (busy || !(await shiftOver())) return;
      busy = true;
      await endSession();
      try {
        await signOut(auth);
      } catch {
        // signed out locally anyway
      }
      if (navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
      showNotice('shift');
      busy = false;
    };
    const timer = setInterval(check, 60 * 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [start]);

  // The IT Admin revoked this session (Session Monitor): sign out and go
  // back to Login, wherever the enforcer is in the app.
  useEffect(() => {
    setRevokeHandler(async () => {
      try {
        await signOut(auth);
      } catch {
        // signed out locally anyway
      }
      if (navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
      Alert.alert('Session ended', 'Your session was ended by the IT Admin. Please log in again.');
    });
    return () => setRevokeHandler(null);
  }, []);

  if (!start) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName={start.route}
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            animationDuration: 250,
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
          <Stack.Screen
            name="ClampDashboard"
            component={ClampDashboardScreen}
            options={{ animation: 'fade' }}
            initialParams={start.params}
          />
          <Stack.Screen name="ScanQR" component={ScanQRScreen} />
          <Stack.Screen name="ClampingDetails" component={ClampingDetailsScreen} />
          <Stack.Screen
            name="CapturePhoto"
            component={CapturePhotoScreen}
            options={{ animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="ClampActivity" component={ClampActivityScreen} />
          <Stack.Screen name="ViolationDetails" component={ViolationDetailsScreen} />
          <Stack.Screen name="Success" component={SuccessScreen} options={{ animation: 'fade' }} />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{ animation: 'slide_from_right' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E0F12',
  },
});
