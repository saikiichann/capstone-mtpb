import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jptelykihburtnkceoai.supabase.co';
const supabasePublishableKey = 'sb_publishable_Xn8b-NfEgQ_Sk8RC2S0rXQ_Qk-sr0-C';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export const SUPABASE_BUCKET = 'violation-photos';

/** Camera and screenshot paths sometimes come without "file://". */
function toFileUri(localUri) {
  const u = String(localUri || '');
  if (!u) throw new Error('No photo to upload.');
  return /^(file|content):\/\//.test(u) ? u : `file://${u}`;
}

/**
 * Uploads one photo straight to the Storage REST API with React Native's own
 * fetch + FormData (the standard way to upload a file in React Native).
 * Same request supabase-js sends (apikey, Authorization, x-upsert: false),
 * but without going through supabase-js, whose auth and realtime parts are
 * not needed here.
 */
async function uploadToBucket(fileName, localUri) {
  const uri = toFileUri(localUri);
  const formData = new FormData();
  formData.append('cacheControl', '3600');
  formData.append('file', { uri, name: fileName.split('/').pop(), type: 'image/jpeg' });

  let res;
  try {
    res = await fetch(`${supabaseUrl}/storage/v1/object/${SUPABASE_BUCKET}/${fileName}`, {
      method: 'POST',
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${supabasePublishableKey}`,
        // Never replace an existing photo: an upload with the same name fails.
        'x-upsert': 'false',
      },
      body: formData,
    });
  } catch (e) {
    console.log('[upload] network error:', e?.message, e?.stack);
    throw new Error('Photo upload failed: no internet connection or the server could not be reached.');
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.message || body?.error || msg;
    } catch (e) {
      // response was not JSON
    }
    console.log('[upload] rejected:', res.status, msg);
    throw new Error(`Photo upload failed: ${msg}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${SUPABASE_BUCKET}/${fileName}`;
}

/** Evidence photo. Random part so a photo's address can't be guessed. */
export async function uploadViolationPhoto(localUri, cin) {
  const random = Math.random().toString(36).slice(2, 10);
  return uploadToBucket(`${cin}-${random}.jpg`, localUri);
}

/**
 * Profile picture (Edit Profile → Change photo). New name every time, never
 * overwrites, so it also works with an insert-only bucket policy.
 */
export async function uploadProfilePhoto(localUri, uid) {
  const random = Math.random().toString(36).slice(2, 10);
  return uploadToBucket(`profiles/${uid}-${random}.jpg`, localUri);
}
