import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@whilom/database';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Server Supabase client for Server Components, Route Handlers and Server
 * Actions. Uses the anon key + the user's session cookie, so RLS still applies.
 *
 * Typed against the generated schema. This is the anon key only: the
 * service-role client in `@whilom/database` is never imported here, and must
 * never reach a client bundle.
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
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware refreshes the session.
          }
        },
      },
    },
  );
}
