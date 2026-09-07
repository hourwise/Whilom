'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Completes the hosted email-confirmation flow and immediately removes Auth
 * material from the browser URL.
 *
 * The project currently uses Supabase's default email provider, which cannot
 * install a custom token-hash email template on its current plan. The default
 * provider may return a PKCE code or an implicit-flow fragment, while the
 * token-hash branch keeps this callback compatible with the future SSR email
 * template when that becomes available.
 */
export default function AuthConfirmPage() {
  const status = 'Confirming your email…';

  useEffect(() => {
    let cancelled = false;

    async function completeConfirmation() {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const tokenHash = query.get('token_hash');
      const type = query.get('type');
      const code = query.get('code');
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      const supabase = createClient();

      let error: { message?: string } | null = null;

      if (tokenHash && type === 'email') {
        ({ error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash }));
      } else if (tokenHash && type === 'recovery') {
        window.location.replace('/login?error=recovery_not_supported');
        return;
      } else if (code) {
        ({ error } = await supabase.auth.exchangeCodeForSession(code));
      } else if (accessToken && refreshToken) {
        ({ error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }));
      } else {
        window.location.replace('/login?error=invalid_confirmation');
        return;
      }

      if (error) {
        // Keep provider/auth details out of the URL and user-facing page.
        window.location.replace('/login?error=confirmation_failed');
        return;
      }

      if (!cancelled) window.location.replace('/account');
    }

    completeConfirmation().catch(() => {
      if (!cancelled) window.location.replace('/login?error=confirmation_failed');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return <p>{status}</p>;
}
