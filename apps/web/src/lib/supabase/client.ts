import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client for Client Components. Anon key only (RLS enforced).
 *
 * Untyped for now: run `pnpm db:types` once the local Supabase stack is up, then
 * add the `<Database>` generic here and in `server.ts` for typed queries.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
