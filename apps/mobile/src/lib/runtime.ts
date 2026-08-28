export type MobileRuntimeMode = 'fixture' | 'live';
export type MobileRuntimeEnvironment = 'development' | 'production';

export interface MobileRuntimePolicy {
  environment: MobileRuntimeEnvironment;
  requestedMode: MobileRuntimeMode;
  publicSupabaseConfigured: boolean;
  status: 'ready' | 'configuration_error';
  fixtureAllowed: boolean;
  liveReadsAllowed: boolean;
  liveWritesAllowed: false;
  reason?: string;
}

/**
 * Product/release guard only. Supabase Auth and RLS remain the authority.
 * Fixture data is convenient in development, but this branch never enables
 * hosted writes, even when public Supabase variables happen to be present.
 */
export function getMobileRuntimePolicy(): MobileRuntimePolicy {
  const requestedMode: MobileRuntimeMode = process.env.EXPO_PUBLIC_WHILOM_DATA_MODE?.trim().toLowerCase() === 'live' ? 'live' : 'fixture';
  const environment: MobileRuntimeEnvironment = process.env.EXPO_PUBLIC_WHILOM_RELEASE?.trim().toLowerCase() === 'production' || process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const publicSupabaseConfigured = Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim());
  if (environment === 'production' && requestedMode === 'fixture') {
    return { environment, requestedMode, publicSupabaseConfigured, status: 'configuration_error', fixtureAllowed: false, liveReadsAllowed: false, liveWritesAllowed: false, reason: 'Fixture mode is disabled in release context. Select live mode with public Supabase configuration.' };
  }
  if (requestedMode === 'live' && !publicSupabaseConfigured) {
    return { environment, requestedMode, publicSupabaseConfigured, status: 'configuration_error', fixtureAllowed: false, liveReadsAllowed: false, liveWritesAllowed: false, reason: 'Live mode requires the public Supabase URL and anon key. No network request was made.' };
  }
  if (requestedMode === 'live') return { environment, requestedMode, publicSupabaseConfigured, status: 'ready', fixtureAllowed: false, liveReadsAllowed: true, liveWritesAllowed: false, reason: 'Live writes are disabled for Phase 6E; authenticated RLS adapters are prepared but not callable.' };
  return { environment, requestedMode, publicSupabaseConfigured, status: 'ready', fixtureAllowed: true, liveReadsAllowed: false, liveWritesAllowed: false, reason: 'Development fixture mode; all activity remains in memory.' };
}
