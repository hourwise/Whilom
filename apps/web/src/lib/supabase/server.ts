import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@whilom/database';

/**
 * Server Supabase client for Server Components, Route Handlers and Server
 * Actions. Uses the anon key + the user's session cookie, so RLS still applies.
 * For privileged work use a dedicated service-role client kept off the client
 * bundle entirely (spec §38).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` called from a Server Component — safe to ignore when
            // middleware is responsible for refreshing sessions.
          }
        },
      },
    },
  );
}
