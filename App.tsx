import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
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

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
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