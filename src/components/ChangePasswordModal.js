import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { auth } from '../firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

export default function ChangePasswordModal({ visible, onClose, userEmail }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = async () => {
    setError('');
    setSuccess(false);

    // Validation
    if (!currentPw || !newPw || !confirmPw) {
      setError('Please fill in all fields.');
      return;
    }
    if (newPw.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setError('New passwords do not match.');
      return;
    }
    if (currentPw === newPw) {
      setError('New password must be different from current password.');
      return;
    }

    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not logged in. Please login again.');
      }

      // 1. Re-authenticate gamit ang current password
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, credential);

      // 2. I-update ang password
      await updatePassword(user, newPw);

      setSuccess(true);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');

      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2500);
    } catch (err) {
      console.error('Change password error:', err);

      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Current password is incorrect.');
      } else if (err.code === 'auth/weak-password') {
        setError('New password is too weak.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err.message || 'Failed to change password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setError('');
    setSuccess(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Change Password</Text>
            <TouchableOpacity onPress={handleClose} disabled={loading}>
              <Icon name="x" size={20} color={colors.black} />
            </TouchableOpacity>
          </View>

          {!success ? (
            <>
              <Text style={styles.subtitle}>
                I-type ang iyong kasalukuyang password at ang bagong password.
              </Text>

              <Text style={styles.label}>CURRENT PASSWORD</Text>
              <View style={styles.inputRow}>
                <Icon name="lock" size={18} color={colors.gray} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={currentPw}
                  onChangeText={setCurrentPw}
                  secureTextEntry={!showCurrent}
                  placeholder="••••••••••"
                  placeholderTextColor={colors.gray}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowCurrent((v) => !v)} style={styles.eyeButton}>
                  <Icon name={showCurrent ? 'eye-off' : 'eye'} size={18} color={colors.gray} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>NEW PASSWORD</Text>
              <View style={styles.inputRow}>
                <Icon name="key" size={18} color={colors.gray} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={newPw}
                  onChangeText={setNewPw}
                  secureTextEntry={!showNew}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.gray}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowNew((v) => !v)} style={styles.eyeButton}>
                  <Icon name={showNew ? 'eye-off' : 'eye'} size={18} color={colors.gray} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>CONFIRM NEW PASSWORD</Text>
              <View style={styles.inputRow}>
                <Icon name="key" size={18} color={colors.gray} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={confirmPw}
                  onChangeText={setConfirmPw}
                  secureTextEntry={!showNew}
                  placeholder="Re-enter new password"
                  placeholderTextColor={colors.gray}
                  editable={!loading}
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.button, loading && { opacity: 0.6 }]}
                onPress={handleChange}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.buttonText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.successBox}>
              <Icon name="check-circle" size={48} color={colors.green} />
              <Text style={styles.successTitle}>Password Changed!</Text>
              <Text style={styles.successText}>
                Gamitin ang bagong password sa susunod na login.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modal: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.black },
  subtitle: {
    fontSize: 13,
    color: colors.gray,
    lineHeight: 18,
    marginBottom: 16,
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
  button: {
    backgroundColor: colors.black,
    borderRadius: 10,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  successBox: { alignItems: 'center', paddingVertical: 24 },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.black,
    marginTop: 16,
    marginBottom: 8,
  },
  successText: {
    fontSize: 13,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 18,
  },
});