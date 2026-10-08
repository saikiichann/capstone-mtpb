import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { auth, db } from '../firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function EditProfileScreen({ navigation, route }) {
  const officerUid = route?.params?.officerUid || null;
  const initialName = route?.params?.officerName || '';

  // Profile data
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Password data
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState('');

  // Profile info (username, role, email)
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');

  // === LOAD PROFILE DATA ===
  useEffect(() => {
    const loadProfile = async () => {
      if (!officerUid) {
        setLoading(false);
        return;
      }

      try {
        const docRef = doc(db, 'users', officerUid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setName(data.name ?? '');
          setUsername(data.username ?? '');
          setRole(data.role ?? '');
          setEmail(data.email ?? '');
        }
      } catch (err) {
        console.error('Load profile error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [officerUid]);

  // === SAVE PROFILE (name) ===
  const handleSaveProfile = async () => {
    setProfileError('');
    setProfileSuccess(false);

    if (!name.trim()) {
      setProfileError('Name cannot be empty.');
      return;
    }

    setSavingProfile(true);

    try {
      await updateDoc(doc(db, 'users', officerUid), {
        name: name.trim(),
        updatedAt: serverTimestamp(),
      });

      // Audit log
      await updateDoc(doc(db, 'auditLogs', `${Date.now()}`), {}).catch(() => {});

      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      console.error('Save profile error:', err);
      setProfileError(err.message || 'Failed to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // === CHANGE PASSWORD ===
  const handleChangePassword = async () => {
    setPwError('');
    setPwSuccess(false);

    if (!currentPw || !newPw || !confirmPw) {
      setPwError('Please fill in all password fields.');
      return;
    }
    if (newPw.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('New passwords do not match.');
      return;
    }
    if (currentPw === newPw) {
      setPwError('New password must be different from current password.');
      return;
    }

    setSavingPw(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in.');

      // Re-authenticate
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPw);

      setPwSuccess(true);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err) {
      console.error('Change password error:', err);

      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPwError('Current password is incorrect.');
      } else if (err.code === 'auth/weak-password') {
        setPwError('New password is too weak.');
      } else if (err.code === 'auth/requires-recent-login') {
        setPwError('Session expired. Please login again.');
      } else {
        setPwError(err.message || 'Failed to change password.');
      }
    } finally {
      setSavingPw(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={colors.navy} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={20} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={{ width: 20 }} />
        </View>
        <View style={[styles.body, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={{ marginTop: 12, color: colors.gray }}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* AVATAR */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <Icon name="user" size={56} color={colors.white} />
          </View>
          <TouchableOpacity style={styles.changePhotoBtn}>
            <Icon name="camera" size={12} color={colors.gray} />
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        {/* PROFILE INFO (read-only) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Information</Text>

          <Text style={styles.label}>USERNAME</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{username || '—'}</Text>
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>ROLE</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{role || '—'}</Text>
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>EMAIL</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{email || '—'}</Text>
          </View>
        </View>

        {/* EDIT NAME */}
        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={styles.cardTitle}>Personal Information</Text>

          <Text style={styles.label}>FULL NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Juan Dela Cruz"
            placeholderTextColor={colors.gray}
            editable={!savingProfile}
          />

          {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, savingProfile && { opacity: 0.6 }]}
            onPress={handleSaveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? (
              <ActivityIndicator color={colors.white} />
            ) : profileSuccess ? (
              <Text style={styles.primaryBtnText}>✓ Saved!</Text>
            ) : (
              <Text style={styles.primaryBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* CHANGE PASSWORD */}
        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={styles.cardTitle}>Change Password</Text>

          <Text style={styles.label}>CURRENT PASSWORD</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputInline}
              value={currentPw}
              onChangeText={setCurrentPw}
              secureTextEntry={!showCurrent}
              placeholder="••••••••••"
              placeholderTextColor={colors.gray}
              editable={!savingPw}
            />
            <TouchableOpacity onPress={() => setShowCurrent((v) => !v)} style={styles.eyeButton}>
              <Icon name={showCurrent ? 'eye-off' : 'eye'} size={16} color={colors.gray} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>NEW PASSWORD</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputInline}
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry={!showNew}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.gray}
              editable={!savingPw}
            />
            <TouchableOpacity onPress={() => setShowNew((v) => !v)} style={styles.eyeButton}>
              <Icon name={showNew ? 'eye-off' : 'eye'} size={16} color={colors.gray} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>CONFIRM NEW PASSWORD</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputInline}
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry={!showNew}
              placeholder="Re-enter new password"
              placeholderTextColor={colors.gray}
              editable={!savingPw}
            />
          </View>

          {pwError ? <Text style={styles.errorText}>{pwError}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, savingPw && { opacity: 0.6 }]}
            onPress={handleChangePassword}
            disabled={savingPw}
          >
            {savingPw ? (
              <ActivityIndicator color={colors.white} />
            ) : pwSuccess ? (
              <Text style={styles.primaryBtnText}>✓ Password Changed!</Text>
            ) : (
              <Text style={styles.primaryBtnText}>Update Password</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.navy },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 44,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: colors.white, fontSize: 16, fontWeight: '700' },
  body: { flex: 1, backgroundColor: colors.offWhite },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    gap: 6,
  },
  changePhotoText: { fontSize: 12, fontWeight: '600', color: colors.gray },
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.black,
    marginBottom: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.gray,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  readOnly: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
    justifyContent: 'center',
    backgroundColor: colors.offWhite,
  },
  readOnlyText: { fontSize: 13, color: colors.gray },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: colors.black,
    backgroundColor: colors.white,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: colors.white,
  },
  inputInline: {
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
    marginTop: 10,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: colors.black,
    borderRadius: 8,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});