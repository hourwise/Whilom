import { createAnonClient, type HeritageClient } from '@whilom/database';

/**
 * Mobile Supabase configuration. Only public client values may be supplied to
 * an Expo bundle; no service-role or ingestion credential belongs here.
 */
export const mobileSupabaseConfig = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '',
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '',
};

export function getMobileSupabaseClient(): HeritageClient | null {
  if (!mobileSupabaseConfig.url || !mobileSupabaseConfig.anonKey) return null;
  return createAnonClient(mobileSupabaseConfig);
}
