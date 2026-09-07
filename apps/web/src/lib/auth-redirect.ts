import { headers } from 'next/headers';

export const AUTH_CONFIRM_PATH = '/auth/confirm';

const AUTH_REDIRECT_ORIGINS: Record<string, string> = {
  'localhost:3000': 'http://localhost:3000',
  'whilom-web-preview.philgeran.workers.dev':
    'https://whilom-web-preview.philgeran.workers.dev',
  'whilom.co.uk': 'https://whilom.co.uk',
};

/**
 * Resolves a request host to an explicitly approved Whilom application origin.
 *
 * The allow-list is intentionally exact. We do not reflect arbitrary Host or
 * forwarded-host headers into Supabase redirect URLs.
 */
export function resolveAuthOrigin(host: string | null | undefined): string | null {
  if (!host) return null;
  return AUTH_REDIRECT_ORIGINS[host.trim().toLowerCase()] ?? null;
}

export function authConfirmUrl(origin: string): string {
  return `${origin}${AUTH_CONFIRM_PATH}`;
}

/**
 * Gets the confirmation callback for the current request without trusting an
 * arbitrary deployment hostname. A missing/unknown origin fails closed.
 */
export async function getAuthConfirmUrl(): Promise<string | null> {
  const requestHeaders = await headers();
  const origin = resolveAuthOrigin(requestHeaders.get('host'));
  return origin ? authConfirmUrl(origin) : null;
}
