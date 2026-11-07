import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './public-supabase-config.js';

export const publicSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export async function publicRpc(name, params = {}) {
  const { data, error } = await publicSupabase.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}
