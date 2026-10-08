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
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';

interface LoginScreenProps {
  navigation: any;
}

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [username, setUsername] = useState('juandelacruz@mtpbclamp.ph');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    // Kung gusto mo muna i-bypass habang inaayos ang Firebase access:
    // navigation.replace('ClampDashboard');
    // return;

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.logoWrap}>
            <Image source={require('../../assets/mtpb_logo.png')} style={styles.logo} resizeMode="contain" />
          </View>

          <Text style={styles.headerTitle}>Manila Traffic and{'\n'}Parking Bureau</Text>
        </View>

        {/* FORM CARD */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Enforcer App</Text>

          {/* USERNAME */}
          <Text style={styles.label}>USERNAME</Text>

          <View style={styles.inputRow}>
            <Icon name="user" size={18} color={colors.gray} style={styles.inputIcon} />

            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@mtpb.ph"
              placeholderTextColor={colors.gray}
            />
          </View>

          {/* PASSWORD */}
          <Text style={[styles.label, { marginTop: 20 }]}>PASSWORD</Text>

          <View style={styles.inputRow}>
            <Icon name="lock" size={18} color={colors.gray} style={styles.inputIcon} />

            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="••••••••••"
              placeholderTextColor={colors.gray}
            />

            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton}>
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.gray} />
            </TouchableOpacity>
          </View>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          {/* SIGN IN */}
          <TouchableOpacity style={styles.signInButton} onPress={handleSignIn} disabled={loading}>
            <Text style={styles.signInText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
          </TouchableOpacity>

          {/* FORGOT PASSWORD */}
          <TouchableOpacity style={styles.forgotButton}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {/* FOOTER */}
          <View style={styles.footerPillWrap}>
            <View style={styles.footerPill}>
              <Text style={styles.footerPillText}>AUTHORIZED PERSONNEL ONLY</Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  header: {
    backgroundColor: colors.navy,
    paddingTop: 40,
    paddingBottom: 56,
    alignItems: 'center',
    borderBottomRightRadius: 60,
  },
  logoWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logo: {
    width: 96,
    height: 96,
  },
  headerTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 26,
  },
  formCard: {
    flex: 1,
    backgroundColor: colors.white,
    marginTop: -28,
    borderTopLeftRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 32,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.black,
    textAlign: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.black,
  },
  eyeButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  errorText: {
    color: colors.red,
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  signInButton: {
    backgroundColor: colors.black,
    borderRadius: 10,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  signInText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  forgotButton: {
    alignSelf: 'center',
    marginTop: 18,
  },
  forgotText: {
    color: colors.gray,
    fontSize: 13,
  },
  footerPillWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  footerPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  footerPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.gray,
    letterSpacing: 0.5,
  },
});