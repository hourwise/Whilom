import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';

export type HeritageClient = SupabaseClient<Database>;

export interface AnonClientConfig {
  url: string;
  anonKey: string;
}

/**
 * Anon/public client — safe for browser and mobile.
 * Access is governed entirely by Row Level Security (spec §38).
 */
export function createAnonClient(config: AnonClientConfig): HeritageClient {
  return createClient<Database>(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

export interface ServiceClientConfig {
  url: string;
  serviceRoleKey: string;
}

/**
 * Service-role client — bypasses RLS. SERVER / INGESTION ONLY.
 *
 * Never import this from `apps/web` client components or from `apps/mobile`.
 * The service-role key must never be bundled into a client (spec §3, §38).
 */
export function createServiceClient(config: ServiceClientConfig): HeritageClient {
  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
