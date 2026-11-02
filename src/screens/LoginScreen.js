import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Modal,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { ui } from '../theme/ui';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { startSession } from '../session';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

/** IT Admin hotline shown on Forgot password. */
const IT_ADMIN_PHONE = '(02) 8888-1234';
const IT_ADMIN_TEL = 'tel:0288881234';
/** MTPB office email for password help. */
const MTPB_EMAIL = 'mtpbovrdivision@gmail.com';

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(null);
  const [showForgot, setShowForgot] = useState(false);

  const handleSignIn = async () => {
    setErrorMsg('');
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Please enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      let email = username.trim().toLowerCase();
      if (!email.includes('@')) email = `${email}@mtpb.gov.ph`;

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      const userDocRef = doc(db, 'users', uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await auth.signOut();
        setErrorMsg('Account not found in the system. Contact the IT Admin.');
        return;
      }
      const userData = userDocSnap.data();
      if (userData.status !== 'active') {
        await auth.signOut();
        setErrorMsg(`Account is ${userData.status}. Contact the IT Admin.`);
        return;
      }
      if (userData.role !== 'clamping-staff') {
        await auth.signOut();
        setErrorMsg('This account is not registered to the Clamping Team.');
        return;
      }

      await updateDoc(userDocRef, { lastLogin: serverTimestamp() });
      // Session Monitor (IT Admin): device + IP. Runs in the background.
      startSession({ uid, name: userData.name });
      navigation.replace('ClampDashboard', {
        officerName: userData.name ?? 'Unknown Officer',
        officerUid: uid,
      });
    } catch (err) {
      console.log('Login error:', err?.code);
      if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(err.code)) {
        setErrorMsg('Wrong username or password.');
      } else if (err.code === 'auth/too-many-requests') {
        setErrorMsg('Too many attempts. Please try again later.');
      } else if (err.code === 'auth/network-request-failed') {
        setErrorMsg('No internet connection. Check your signal and try again.');
      } else {
        setErrorMsg(err.message || 'Sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const callItAdmin = () => {
    Linking.openURL(IT_ADMIN_TEL).catch(() =>
      Alert.alert('Call IT Admin', `Please call ${IT_ADMIN_PHONE}.`)
    );
  };

  const emailMtpb = () => {
    const who = username.trim() ? `Username: ${username.trim()}\n` : 'Username: \n';
    const subject = encodeURIComponent('Enforcer App - Forgot password');
    const body = encodeURIComponent(
      `Good day,\n\nI forgot the password of my Enforcer App account. Please help me reset it.\n\n${who}Full name: \nContact number: \n\nThank you.`
    );
    Linking.openURL(`mailto:${MTPB_EMAIL}?subject=${subject}&body=${body}`).catch(() =>
      Alert.alert('Email MTPB', `Please send an email to ${MTPB_EMAIL}.`)
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={ui.ink} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
          {/* BRAND */}
          <View style={styles.brand}>
            <View style={styles.logoRing}>
              <Image
                source={require('../../assets/mtpb_logo.png')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="MTPB seal"
              />
            </View>
            <Text style={styles.agency}>MANILA TRAFFIC & PARKING BUREAU</Text>
            <Text style={styles.appName}>Enforcer App</Text>
          </View>

          {/* FORM */}
          <View style={styles.sheet}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>Use the account given by your IT Admin.</Text>

            <Text style={styles.label} nativeID="usernameLabel">
              Username
            </Text>
            <View style={[styles.inputRow, focused === 'u' && styles.inputRowFocused]}>
              <Icon name="user" size={20} color={ui.muted} />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                onFocus={() => setFocused('u')}
                onBlur={() => setFocused(null)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="j.delacruz"
                placeholderTextColor="#7A808C"
                editable={!loading}
                accessibilityLabelledBy="usernameLabel"
                accessibilityLabel="Username"
              />
            </View>

            <Text style={styles.label} nativeID="passwordLabel">
              Password
            </Text>
            <View style={[styles.inputRow, styles.inputRowPw, focused === 'p' && styles.inputRowFocused]}>
              <Icon name="lock" size={20} color={ui.muted} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused('p')}
                onBlur={() => setFocused(null)}
                secureTextEntry={!showPassword}
                placeholder="Your password"
                placeholderTextColor="#7A808C"
                editable={!loading}
                onSubmitEditing={handleSignIn}
                returnKeyType="go"
                accessibilityLabel="Password"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={22} color={ui.text2} />
              </TouchableOpacity>
            </View>

            {errorMsg ? (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Icon name="alert-circle" size={18} color={ui.danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.dim]}
              onPress={handleSignIn}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? <ActivityIndicator color={ui.white} /> : <Text style={styles.primaryText}>Sign in</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => setShowForgot(true)}
              disabled={loading}
              accessibilityRole="button"
            >
              <Text style={styles.linkText}>Forgot password?</Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Icon name="lock" size={14} color={ui.muted} />
              <Text style={styles.footerText}>AUTHORIZED PERSONNEL ONLY</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* FORGOT PASSWORD — bottom sheet */}
      <Modal visible={showForgot} transparent animationType="slide" onRequestClose={() => setShowForgot(false)}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={styles.flex} onPress={() => setShowForgot(false)} accessibilityLabel="Close" />
          <View style={styles.forgotSheet} accessibilityViewIsModal>
            <View style={styles.grabber} />
            <View style={styles.forgotIcon}>
              <Icon name="lock" size={30} color={ui.ink} />
            </View>
            <Text style={styles.forgotTitle}>Forgot your password?</Text>
            <Text style={styles.forgotBody}>
              Call or email the IT Admin. They will check your identity and give you a temporary password.
            </Text>
            <View style={styles.steps}>
              {['Call or email using the buttons below', 'Sign in with the temporary password', 'Set a new one in My Profile'].map(
                (t, i) => (
                  <View key={t} style={styles.step}>
                    <Text style={styles.stepNum}>{i + 1}</Text>
                    <Text style={styles.stepText}>{t}</Text>
                  </View>
                )
              )}
            </View>
            <TouchableOpacity style={styles.callBtn} onPress={callItAdmin} accessibilityRole="button">
              <Icon name="phone" size={22} color={ui.white} />
              <Text style={styles.callText}>Call IT Admin · {IT_ADMIN_PHONE}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.emailBtn}
              onPress={emailMtpb}
              accessibilityRole="button"
              accessibilityLabel={`Email MTPB at ${MTPB_EMAIL}`}
            >
              <Icon name="mail" size={20} color={ui.ink} />
              <View style={styles.emailTextWrap}>
                <Text style={styles.emailText}>Email MTPB</Text>
                <Text style={styles.emailAddr} numberOfLines={1}>
                  {MTPB_EMAIL}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowForgot(false)} accessibilityRole="button">
              <Text style={styles.outlineText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: ui.ink },
  scroll: { flexGrow: 1 },
  brand: { alignItems: 'center', paddingTop: 48, paddingBottom: 32, paddingHorizontal: 24 },
  logoRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: ui.accent,
    backgroundColor: ui.ink2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logo: { width: 88, height: 88 },
  agency: { fontSize: 13, fontWeight: '600', letterSpacing: 1.5, color: ui.onDarkMuted, textAlign: 'center' },
  appName: { fontSize: 34, fontWeight: '800', color: ui.white, marginTop: 6 },
  sheet: {
    flexGrow: 1,
    backgroundColor: ui.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  title: { fontSize: 24, fontWeight: '700', color: ui.ink },
  subtitle: { fontSize: 15, color: ui.muted, marginTop: 6, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', color: ui.ink, marginTop: 16, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: ui.field,
    borderRadius: 14,
    backgroundColor: ui.white,
  },
  inputRowPw: { paddingRight: 6 },
  inputRowFocused: { borderColor: ui.ink },
  input: { flex: 1, marginLeft: 10, fontSize: 17, fontWeight: '500', color: ui.ink, paddingVertical: 0 },
  eyeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: ui.dangerSoft,
  },
  errorText: { flex: 1, marginLeft: 8, fontSize: 14, fontWeight: '600', color: ui.danger },
  primaryBtn: {
    height: 58,
    borderRadius: 16,
    backgroundColor: ui.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  primaryText: { color: ui.white, fontSize: 18, fontWeight: '700' },
  dim: { opacity: 0.6 },
  linkBtn: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, marginTop: 8 },
  linkText: { fontSize: 15, fontWeight: '600', color: ui.ink, textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 'auto', paddingTop: 24 },
  footerText: { marginLeft: 8, fontSize: 12, fontWeight: '600', letterSpacing: 1, color: ui.muted },
  backdrop: { flex: 1, backgroundColor: 'rgba(14,15,18,0.55)' },
  forgotSheet: {
    backgroundColor: ui.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: ui.field, marginBottom: 20 },
  forgotIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: ui.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotTitle: { fontSize: 26, fontWeight: '800', color: ui.ink, marginTop: 20 },
  forgotBody: { fontSize: 16, lineHeight: 24, color: ui.text2, marginTop: 8 },
  steps: { backgroundColor: ui.ground, borderRadius: 16, padding: 16, marginTop: 20 },
  step: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: ui.ink,
    color: ui.white,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 28,
  },
  stepText: { marginLeft: 12, fontSize: 15, color: ui.ink, flex: 1 },
  callBtn: {
    flexDirection: 'row',
    height: 60,
    borderRadius: 16,
    backgroundColor: ui.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  callText: { color: ui.white, fontSize: 17, fontWeight: '700', marginLeft: 12 },
  emailBtn: {
    flexDirection: 'row',
    minHeight: 60,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: ui.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 10,
  },
  emailTextWrap: { marginLeft: 12, flexShrink: 1 },
  emailText: { fontSize: 16, fontWeight: '700', color: ui.ink },
  emailAddr: { fontSize: 14, color: ui.text2, marginTop: 1 },
  outlineBtn: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: ui.field,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  outlineText: { fontSize: 16, fontWeight: '600', color: ui.ink },
});
