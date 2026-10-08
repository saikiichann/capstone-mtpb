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

export async function uploadViolationPhoto(localUri, cin) {
  const uri = localUri.startsWith('file://') ? localUri : `file://${localUri}`;
  const fileName = `${cin}.jpg`;

  // Gamitin ang FormData
  const formData = new FormData();
  formData.append('file', {
    uri: uri,
    name: fileName,
    type: 'image/jpeg',
  });

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(fileName, formData, {
      contentType: 'multipart/form-data',
      upsert: true,
    });

  if (error) {
    throw new Error(`Photo upload failed: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(fileName);

  return data.publicUrl;
}