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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import ConfirmModal from '../components/ConfirmModal';
import { ui, initialsOf, enforcerIdOf } from '../theme/ui';
import { auth, db } from '../firebase';
import { endSession } from '../session';
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { uploadProfilePhoto } from '../supabase';

const ROLE_NAMES = { 'clamping-staff': 'Clamping Staff' };

/**
 * My Profile: name, email, username, ID and role are read-only (only the IT
 * Admin changes them). The enforcer can change the photo and the password.
 */
export default function EditProfileScreen({ navigation, route }) {
  const officerUid = route?.params?.officerUid || auth.currentUser?.uid || null;
  const newPhotoUri = route?.params?.newPhotoUri || null;

  const [profile, setProfile] = useState({ name: route?.params?.officerName || '' });
  const [loading, setLoading] = useState(true);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [show, setShow] = useState({ cur: false, new: false, conf: false });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState(null); // { ok, text }
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    if (!officerUid) {
      setLoading(false);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'users', officerUid),
      (snap) => {
        setProfile(snap.data() || {});
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [officerUid]);

  // Back from the camera with a new photo: upload it and save its link.
  useEffect(() => {
    if (!newPhotoUri || !officerUid) return;
    let cancelled = false;
    (async () => {
      setPhotoBusy(true);
      setPhotoMsg('');
      try {
        const url = await uploadProfilePhoto(newPhotoUri, officerUid);
        await updateDoc(doc(db, 'users', officerUid), { photoUrl: url, updatedAt: serverTimestamp() });
        if (!cancelled) setPhotoMsg('Photo updated.');
      } catch (err) {
        if (!cancelled) setPhotoMsg(err?.message || 'Photo could not be saved. Try again.');
      } finally {
        if (!cancelled) setPhotoBusy(false);
        navigation.setParams({ newPhotoUri: undefined });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [newPhotoUri, officerUid, navigation]);

  const changePhoto = () =>
    navigation.navigate('CapturePhoto', {
      returnTo: 'EditProfile',
      paramName: 'newPhotoUri',
      front: true,
      title: 'Profile photo',
      hint: 'Face the camera in good light.',
    });

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (!currentPw || !newPw || !confirmPw) return setPwMsg({ ok: false, text: 'Please fill in all three fields.' });
    if (newPw.length < 6) return setPwMsg({ ok: false, text: 'New password must be at least 6 characters.' });
    if (newPw !== confirmPw) return setPwMsg({ ok: false, text: 'The new passwords do not match.' });
    if (currentPw === newPw) return setPwMsg({ ok: false, text: 'Use a password different from the current one.' });

    setSavingPw(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in. Please sign in again.');
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPw));
      await updatePassword(user, newPw);
      if (profile.mustChangePassword && officerUid) {
        await updateDoc(doc(db, 'users', officerUid), { mustChangePassword: false }).catch(() => {});
      }
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwMsg({ ok: true, text: 'Password changed.' });
    } catch (err) {
      const code = err?.code;
      const text =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Current password is wrong.'
          : code === 'auth/weak-password'
          ? 'New password is too weak.'
          : code === 'auth/requires-recent-login'
          ? 'Please sign in again, then change your password.'
          : code === 'auth/too-many-requests'
          ? 'Too many tries. Please wait and try again.'
          : err?.message || 'Password could not be changed.';
      setPwMsg({ ok: false, text });
    } finally {
      setSavingPw(false);
    }
  };

  const handleLogout = async () => {
    setShowLogout(false);
    try {
      await endSession();
      await signOut(auth);
    } catch (e) {
      // signed out locally anyway
    }
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const pwField = (key, label, value, setValue, placeholder) => (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pwRow}>
        <TextInput
          style={styles.pwInput}
          value={value}
          onChangeText={setValue}
          secureTextEntry={!show[key]}
          placeholder={placeholder}
          placeholderTextColor="#7A808C"
          editable={!savingPw}
          accessibilityLabel={label}
        />
        <TouchableOpacity
          style={styles.eyeBtn}
          onPress={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
          accessibilityRole="button"
          accessibilityLabel={`${show[key] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        >
          <Icon name={show[key] ? 'eye-off' : 'eye'} size={22} color={ui.text2} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const detail = (label, value) => (
    <View style={styles.detail}>
      <Text style={styles.dt}>{label}</Text>
      <Text style={styles.dd}>{value || '—'}</Text>
    </View>
  );

  const name = profile.name || route?.params?.officerName || '';
  const role =
    (ROLE_NAMES[profile.role] || profile.role || 'Clamping Staff') +
    (profile.isTeamLeader === true ? ' (Team Leader)' : '');
  const area = profile.assignedDistrict
    ? `${profile.assignedDistrict}, Manila`
    : profile.assignedLocation || 'District 3, Manila';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ui.ink} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Icon name="arrow-left" size={22} color={ui.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
          {loading ? (
            <ActivityIndicator style={styles.loader} size="large" color={ui.ink} />
          ) : (
            <>
              <View style={styles.avatarBlock}>
                <View style={styles.avatar}>
                  {profile.photoUrl ? (
                    <Image source={{ uri: profile.photoUrl }} style={styles.avatarImg} />
                  ) : (
                    <Text style={styles.avatarText}>{initialsOf(name)}</Text>
                  )}
                  {photoBusy && (
                    <View style={styles.avatarBusy}>
                      <ActivityIndicator color={ui.white} />
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={changePhoto}
                  disabled={photoBusy}
                  accessibilityRole="button"
                >
                  <Icon name="camera" size={18} color={ui.ink} />
                  <Text style={styles.photoBtnText}>{photoBusy ? 'Saving photo…' : 'Change photo'}</Text>
                </TouchableOpacity>
                {!!photoMsg && <Text style={styles.photoMsg}>{photoMsg}</Text>}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Account details</Text>
                <View style={styles.lockNote}>
                  <Icon name="lock" size={14} color={ui.muted} />
                  <Text style={styles.lockText}>Only the IT Admin can change these.</Text>
                </View>
                {detail('Full name', name)}
                {detail('Email', profile.email || auth.currentUser?.email)}
                <View style={styles.twoCol}>
                  <View style={styles.col}>{detail('Username', profile.username)}</View>
                  <View style={styles.col}>{detail('Enforcer ID', enforcerIdOf(officerUid))}</View>
                </View>
                {detail('Role · Area', `${role} · ${area}`)}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Change password</Text>
                {pwField('cur', 'Current password', currentPw, setCurrentPw, 'Enter current password')}
                {pwField('new', 'New password', newPw, setNewPw, 'At least 6 characters')}
                {pwField('conf', 'Type new password again', confirmPw, setConfirmPw, 'Same as above')}
                {pwMsg && (
                  <View style={[styles.msg, pwMsg.ok ? styles.msgOk : styles.msgBad]} accessibilityLiveRegion="polite">
                    <Icon name={pwMsg.ok ? 'check-circle' : 'alert-circle'} size={18} color={pwMsg.ok ? '#17663A' : ui.danger} />
                    <Text style={[styles.msgText, { color: pwMsg.ok ? '#17663A' : ui.danger }]}>{pwMsg.text}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.primaryBtn, savingPw && styles.dim]}
                  onPress={handleChangePassword}
                  disabled={savingPw}
                  accessibilityRole="button"
                >
                  {savingPw ? <ActivityIndicator color={ui.white} /> : <Text style={styles.primaryText}>Update password</Text>}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.logoutBtn} onPress={() => setShowLogout(true)} accessibilityRole="button">
                <Icon name="log-out" size={20} color={ui.danger} />
                <Text style={styles.logoutText}>Log out</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={showLogout}
        title="Log out?"
        message="You will need your username and password to sign in again."
        cancelLabel="Stay"
        confirmLabel="Log out"
        onCancel={() => setShowLogout(false)}
        onConfirm={handleLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: ui.ink },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: ui.white, fontSize: 22, fontWeight: '800', marginLeft: 6 },
  body: { flex: 1, backgroundColor: ui.ground },
  bodyContent: { padding: 16, paddingBottom: 32 },
  loader: { marginTop: 60 },
  avatarBlock: { alignItems: 'center', marginTop: 8, marginBottom: 18 },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#2A2D35',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 108, height: 108 },
  avatarText: { color: ui.white, fontSize: 36, fontWeight: '800' },
  avatarBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,15,18,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: ui.field,
    backgroundColor: ui.white,
  },
  photoBtnText: { marginLeft: 8, fontSize: 15, fontWeight: '600', color: ui.ink },
  photoMsg: { marginTop: 8, fontSize: 14, color: ui.text2 },
  card: {
    backgroundColor: ui.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ui.line,
    padding: 16,
    paddingTop: 18,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: ui.ink },
  lockNote: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 6 },
  lockText: { marginLeft: 6, fontSize: 13, color: ui.muted },
  detail: { marginTop: 12 },
  dt: { fontSize: 13, fontWeight: '600', color: ui.muted },
  dd: { fontSize: 16, fontWeight: '600', color: ui.ink, marginTop: 3 },
  twoCol: { flexDirection: 'row' },
  col: { flex: 1 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: ui.ink, marginTop: 14, marginBottom: 8 },
  pwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    paddingLeft: 16,
    paddingRight: 4,
    borderWidth: 1.5,
    borderColor: ui.field,
    borderRadius: 14,
  },
  pwInput: { flex: 1, fontSize: 16, fontWeight: '500', color: ui.ink, paddingVertical: 0 },
  eyeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  msg: { flexDirection: 'row', alignItems: 'center', marginTop: 14, padding: 12, borderRadius: 12 },
  msgOk: { backgroundColor: ui.goodSoft },
  msgBad: { backgroundColor: ui.dangerSoft },
  msgText: { flex: 1, marginLeft: 8, fontSize: 14, fontWeight: '600' },
  primaryBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: ui.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryText: { color: ui.white, fontSize: 16, fontWeight: '700' },
  dim: { opacity: 0.6 },
  logoutBtn: {
    flexDirection: 'row',
    height: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F3B7B7',
    backgroundColor: ui.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { marginLeft: 8, fontSize: 16, fontWeight: '700', color: ui.danger },
});
