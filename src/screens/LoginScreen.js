import React, { useState } from 'react';
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
  ActivityIndicator,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleSignIn = async () => {
    setErrorMsg('');

    if (!username.trim() || !password.trim()) {
      setErrorMsg('Please enter both username and password.');
      return;
    }

    setLoading(true);

    try {
      let email = username.trim().toLowerCase();
      if (!email.includes('@')) {
        email = `${email}@mtpb.gov.ph`;
      }

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      const userDocRef = doc(db, 'users', uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await auth.signOut();
        setErrorMsg('Account not found in the system. Contact IT Admin.');
        return;
      }

      const userData = userDocSnap.data();

      if (userData.status !== 'active') {
        await auth.signOut();
        setErrorMsg(`Account is ${userData.status}. Contact IT Admin.`);
        return;
      }

      if (userData.role !== 'clamping-staff') {
        await auth.signOut();
        setErrorMsg('This account is not registered to the Clamping Team.');
        return;
      }

      await updateDoc(userDocRef, { lastLogin: serverTimestamp() });

      navigation.replace('ClampDashboard', {
        officerName: userData.name ?? 'Unknown Officer',
        officerUid: uid,
      });
    } catch (err) {
      console.error('Login error:', err);

      if (err.code === 'auth/invalid-credential' ||
          err.code === 'auth/wrong-password' ||
          err.code === 'auth/user-not-found') {
        setErrorMsg('Invalid username or password.');
      } else if (err.code === 'auth/too-many-requests') {
        setErrorMsg('Too many attempts. Please try again later.');
      } else if (err.code === 'auth/network-request-failed') {
        setErrorMsg('Network error. Check your connection.');
      } else {
        setErrorMsg(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForgot = () => setShowForgotModal(true);
  const handleCloseForgot = () => setShowForgotModal(false);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.logoWrap}>
            <Image source={require('../../assets/mtpb_logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <Text style={styles.headerTitle}>Manila Traffic and{'\n'}Parking Bureau</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Enforcer App</Text>

          <Text style={styles.label}>USERNAME</Text>
          <View style={styles.inputRow}>
            <Icon name="user" size={18} color={colors.gray} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="j.delacruz"
              placeholderTextColor={colors.gray}
              editable={!loading}
            />
          </View>

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
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton}>
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.gray} />
            </TouchableOpacity>
          </View>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <TouchableOpacity
            style={[styles.signInButton, loading && { opacity: 0.6 }]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.signInText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotButton}
            onPress={handleOpenForgot}
            disabled={loading}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={styles.footerPillWrap}>
            <View style={styles.footerPill}>
              <Text style={styles.footerPillText}>AUTHORIZED PERSONNEL ONLY</Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* FORGOT PASSWORD MODAL — Contact IT Admin via Call */}
      <Modal
        visible={showForgotModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseForgot}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Forgot Password</Text>
              <TouchableOpacity onPress={handleCloseForgot}>
                <Icon name="x" size={20} color={colors.black} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalIconWrap}>
              <Icon name="shield" size={48} color={colors.navy} />
            </View>

            <Text style={styles.modalSubtitle}>
              Please call the <Text style={styles.modalBold}>IT Admin</Text> to reset your password.
            </Text>

            <Text style={styles.modalBody}>
              You are unable to reset your password on your own. The IT Admin will provide you with a new temporary password.
            </Text>

            <View style={styles.modalInfoBox}>
              <Icon name="phone" size={16} color={colors.navy} />
              <Text style={styles.modalInfoText}>(02) 8888-1234</Text>
            </View>

            <TouchableOpacity
              style={styles.modalButton}
              onPress={handleCloseForgot}
            >
              <Text style={styles.modalButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  logo: { width: 96, height: 96 },
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
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: colors.black },
  eyeButton: { paddingLeft: 8, paddingVertical: 4 },
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
  signInText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  forgotButton: {
    alignSelf: 'center',
    marginTop: 18,
  },
  forgotText: { color: colors.gray, fontSize: 13 },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.black },
  modalIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.offWhite,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.black,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 13,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  modalBold: { fontWeight: '700', color: colors.black },
  modalInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.offWhite,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%',
    marginBottom: 8,
  },
  modalInfoText: {
    fontSize: 13,
    color: colors.black,
    marginLeft: 10,
    fontWeight: '600',
  },
  modalButton: {
    backgroundColor: colors.black,
    borderRadius: 10,
    height: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  modalButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});