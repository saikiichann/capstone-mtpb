import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jptelykihburtnkceoai.supabase.co";
const supabasePublishableKey =
  "sb_publishable_Xn8b-NfEgQ_Sk8RC2S0rXQ_Qk-sr0-C";

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

export const SUPABASE_BUCKET = "violation-photos";