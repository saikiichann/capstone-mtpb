import React, { useState } from 'react';
import { signIn } from '../services/authService';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
  ScrollView,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Icon from 'react-native-vector-icons/Feather';

const { width } = Dimensions.get('window');

interface LoginScreenProps {
  navigation: any;
}

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [username, setUsername] = useState('juandelacruz@mtpb.ph');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Please enter both username and password.');
      return;
    }

    setErrorMsg('');
    setLoading(true);
    try {
      await signIn(username, password);
      navigation.replace('ClampDashboard');
    } catch (e: any) {
      setErrorMsg(e.message || 'Unable to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const SVG_HEIGHT = 280;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0B131F" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} bounces={false} keyboardShouldPersistTaps="handled">

          {/* --- CURVED HEADER SECTION --- */}
          <View style={{ width, height: SVG_HEIGHT, position: 'relative' }}>
        <Svg width={width} height={SVG_HEIGHT} viewBox={`0 0 ${width} ${SVG_HEIGHT}`}>
          <Path
            fill="#0B131F"
            d={`
              M 0,0
              L ${width},0
              L ${width},${SVG_HEIGHT}
              Q ${width - 15},${SVG_HEIGHT - 60} ${width - 65},${SVG_HEIGHT - 60}
              L 65,${SVG_HEIGHT - 60}
              Q 0,${SVG_HEIGHT - 60} 0,${SVG_HEIGHT - 120}
              Z
            `}
          />
        </Svg>

            {/* Logo & Bureau Title */}
            <View style={styles.headerContent}>
              <View style={styles.logoWrap}>
                <Image
                  source={require('../../assets/mtpb_logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.headerTitle}>Manila Traffic and{'\n'}Parking Bureau</Text>
            </View>
          </View>

          {/* --- FORM SECTION --- */}
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>Enforcer App</Text>

            {/* USERNAME */}
            <Text style={styles.label}>USERNAME</Text>
            <View style={styles.inputRow}>
              <Icon name="user" size={18} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="juandelacruz@mtpb.ph"
                placeholderTextColor="#aaa"
              />
            </View>

            {/* PASSWORD */}
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.inputRow}>
              <Icon name="lock" size={18} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="••••••••••"
                placeholderTextColor="#aaa"
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton}>
                <Icon name={showPassword ? 'eye' : 'eye-off'} size={18} color="#888" />
              </TouchableOpacity>
            </View>

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            {/* SIGN IN BUTTON */}
            <TouchableOpacity
              style={[styles.signInButton, loading && { opacity: 0.7 }]}
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.signInText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
            </TouchableOpacity>

            {/* FORGOT PASSWORD */}
            <TouchableOpacity style={styles.forgotButton}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* FOOTER BADGE */}
            <View style={styles.footerPillWrap}>
              <View style={styles.footerPill}>
                <Text style={styles.footerPillText}>AUTHORIZED PERSONNEL ONLY</Text>
              </View>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  headerContent: {
    position: 'absolute',
    top: 40,
    width: '100%',
    alignItems: 'center',
  },
  logoWrap: {
    width: 85,
    height: 85,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  logo: {
    width: 82,
    height: 82,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 24,
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 10,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 22,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#333333',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAEAEA',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 4,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  eyeButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  errorText: {
    color: '#E53935',
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  signInButton: {
    backgroundColor: '#111111',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  signInText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  forgotButton: {
    alignSelf: 'center',
    marginTop: 16,
  },
  forgotText: {
    color: '#888888',
    fontSize: 12,
  },
  footerPillWrap: {
    marginTop: 'auto',
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerPill: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 18,
    backgroundColor: '#EBEBEB',
  },
  footerPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#555555',
    letterSpacing: 0.8,
  },
});