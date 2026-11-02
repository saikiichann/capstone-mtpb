import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Modal, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { formatAddress, OSM_CREDIT } from '../utils/geocode';
import { toMillis } from '../utils/clampState';

/** The lines of the location stamp, from what was saved on the violation. */
export function stampLinesOf(v) {
  const address = formatAddress(v.address);
  const place =
    address || [v.location, v.barangay].filter(Boolean).join(', ') || 'Location not recorded';

  const coords = v.locationCoords;
  const accuracy = v.address?.accuracyM;
  const coordLine =
    coords?.lat != null && coords?.lng != null
      ? `${Number(coords.lat).toFixed(5)}, ${Number(coords.lng).toFixed(5)}` +
        (accuracy != null ? `  ±${accuracy} m` : '')
      : null;

  const ms = toMillis(v.recordedAt);
  const time = ms
    ? new Date(ms).toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const detailLine = [time, v.clampId ? `Clamp ${v.clampId}` : null, v.plateNo || v.plate]
    .filter(Boolean)
    .join('  ·  ');

  const officer = v.officer || v.officerName;

  return {
    place,
    coordLine,
    detailLine,
    officerLine: officer ? `MTPB Enforcer: ${officer}` : null,
    credit: v.address ? OSM_CREDIT : null,
  };
}

/**
 * Evidence photo with the location stamp, like the photo taken in
 * Clamping Details.
 * - New tickets: the stamp is already on the saved photo (photoStamped),
 *   so the photo is shown as is.
 * - Older tickets: the stamp is drawn over the photo from the saved
 *   location, time, clamp and plate.
 * Tap the photo to see it full screen.
 */
export default function EvidencePhoto({ violation, hint }) {
  const uri = violation.photoUrl || violation.photoUri || null;
  const [aspect, setAspect] = useState(4 / 3);
  const [failed, setFailed] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (!uri) return;
    setFailed(false);
    Image.getSize(
      uri,
      (w, h) => {
        if (w > 0 && h > 0) setAspect(w / h);
      },
      () => {}
    );
  }, [uri]);

  if (!uri || failed) {
    return (
      <View style={styles.empty}>
        <Icon name="image" size={20} color={colors.gray} />
        <Text style={styles.emptyText}>{failed ? 'Photo could not be loaded' : 'No evidence photo'}</Text>
      </View>
    );
  }

  const stamp = stampLinesOf(violation);
  const alreadyStamped = violation.photoStamped === true;

  const photo = (inModal) => (
    <View style={[styles.frame, { aspectRatio: aspect }, inModal && styles.frameModal]}>
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
      {!alreadyStamped && (
        <View style={styles.stampBox}>
          <Text style={styles.stampTitle} numberOfLines={2}>
            {stamp.place}
          </Text>
          {stamp.coordLine && <Text style={styles.stampLine}>{stamp.coordLine}</Text>}
          {!!stamp.detailLine && <Text style={styles.stampLine}>{stamp.detailLine}</Text>}
          {stamp.officerLine && <Text style={styles.stampLine}>{stamp.officerLine}</Text>}
          {stamp.credit && <Text style={styles.stampCredit}>{stamp.credit}</Text>}
        </View>
      )}
    </View>
  );

  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setFullScreen(true)}>
        {photo(false)}
      </TouchableOpacity>
      <Text style={styles.hint}>
        {hint ||
          (alreadyStamped
            ? 'Location stamp saved on the photo. Tap to enlarge.'
            : 'Location stamp from the saved ticket details. Tap to enlarge.')}
      </Text>

      <Modal visible={fullScreen} transparent animationType="fade" onRequestClose={() => setFullScreen(false)}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setFullScreen(false)}>
            <Icon name="x" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {photo(true)}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  frameModal: { borderRadius: 0 },
  image: { width: '100%', height: '100%' },
  stampBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  stampTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  stampLine: { color: '#FFFFFF', fontSize: 10, marginTop: 1 },
  stampCredit: { color: 'rgba(255, 255, 255, 0.75)', fontSize: 8, marginTop: 3 },
  hint: { fontSize: 10, color: colors.gray, marginTop: 6, fontStyle: 'italic' },
  empty: {
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.offWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 11, color: colors.gray, marginTop: 6 },
  modalBg: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 40,
    right: 16,
    zIndex: 2,
    padding: 8,
  },
});
