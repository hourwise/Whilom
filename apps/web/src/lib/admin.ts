import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-side authority for the internal review workbench.
 *
 * The role is read from the database on every request, never from anything the
 * client sends and never from a cookie the browser could edit. This is the
 * page-level gate; it is deliberately NOT the only one — every mutation goes
 * through a `SECURITY DEFINER` function that re-checks `is_editor()` in
 * Postgres, and the underlying tables are governed by RLS. Hiding the
 * navigation link is not a security measure and is not treated as one.
 */

export type AdminRole = 'editor' | 'moderator' | 'admin';

const EDITOR_ROLES: readonly string[] = ['editor', 'moderator', 'admin'];

export interface AdminSession {
  userId: string;
  role: AdminRole;
  displayName: string | null;
}

/** Resolve the caller's editorial role, or null if they have none. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) return null;
  if (!EDITOR_ROLES.includes(data.role)) return null;

  return {
    userId: user.id,
    role: data.role as AdminRole,
    displayName: data.display_name,
  };
}

/**
 * Gate an admin page. Sends anonymous visitors to sign in and anyone without an
 * editorial role to the 404, so the workbench's existence is not advertised to
 * ordinary users.
 */
export async function requireEditor(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login');
    redirect('/not-found');
  }
  return session;
}
