import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { auth } from './src/firebase';
import { setRevokeHandler } from './src/session';
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

export default function App() {
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

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            animationDuration: 250,
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
          <Stack.Screen name="ClampDashboard" component={ClampDashboardScreen} options={{ animation: 'fade' }} />
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