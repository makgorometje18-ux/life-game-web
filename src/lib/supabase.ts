import { createClient } from "@supabase/supabase-js";

const fallbackSupabaseUrl = "https://jfsrcyxyzpdsirkjikvy.supabase.co";
const fallbackSupabaseAnonKey = "sb_publishable_t8yyCNLW4VVabDYCTv8cjg_YbjBaMZu";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fallbackSupabaseUrl;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fallbackSupabaseAnonKey;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
