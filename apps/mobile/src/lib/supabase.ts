import { createClient } from '@supabase/supabase-js';
import type { Database } from '@whilom/database';

/**
 * Mobile Supabase client. Anon key only (EXPO_PUBLIC_*), RLS enforced.
 * A persistent session store (e.g. AsyncStorage / SecureStore) is wired in
 * during the Phase 6 mobile MVP.
 */
export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
);
