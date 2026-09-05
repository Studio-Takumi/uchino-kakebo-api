import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Service-role Supabase client. It BYPASSES row-level security, so every query
 * MUST filter/insert with user_id = getUserId() explicitly — RLS will not do it
 * for us here.
 */
export const getSupabase = (): SupabaseClient => {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
};

/** The single user every row is scoped to (single-user app). */
export const getUserId = (): string => {
  const userId = process.env.USER_ID;
  if (!userId) throw new Error('USER_ID must be set');
  return userId;
};
