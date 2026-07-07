import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The Supabase client — only created when cloud auth is configured.
 * In selfhost mode (no env) this is null and the app skips login.
 */
export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon) : null;

/** Cloud mode = Supabase configured → login required. */
export const cloudAuth = !!supabase;
