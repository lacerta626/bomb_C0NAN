import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

export const configured = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_');
export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export async function call(name, params = {}) {
  if (!configured) throw Error('Supabase 설정이 필요합니다. README_SUPABASE.md를 확인하세요.');
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw Error(error.message);
  return data;
}
