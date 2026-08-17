import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@whilom/database';

/**
 * Browser Supabase client for Client Components. Anon key only (RLS enforced).
 *
 * Typed against the generated schema, which CI regenerates from the migrations
 * and holds to a drift check — so a query naming a column that no longer exists
 * fails typecheck rather than at runtime.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
