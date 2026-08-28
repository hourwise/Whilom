import { afterEach, describe, expect, it } from 'vitest';
import { getMobileRuntimePolicy } from './runtime';

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnvironment)) process.env[key] = value;
});

describe('mobile runtime policy', () => {
  it('keeps fixture mode available only in development', () => {
    delete process.env.EXPO_PUBLIC_WHILOM_RELEASE;
    delete process.env.EXPO_PUBLIC_WHILOM_DATA_MODE;
    const policy = getMobileRuntimePolicy();
    expect(policy).toMatchObject({ environment: 'development', requestedMode: 'fixture', fixtureAllowed: true, liveReadsAllowed: false, liveWritesAllowed: false, status: 'ready' });
  });

  it('fails closed instead of showing fixtures in a production-context build', () => {
    process.env.EXPO_PUBLIC_WHILOM_RELEASE = 'production';
    delete process.env.EXPO_PUBLIC_WHILOM_DATA_MODE;
    const policy = getMobileRuntimePolicy();
    expect(policy).toMatchObject({ environment: 'production', requestedMode: 'fixture', fixtureAllowed: false, liveReadsAllowed: false, status: 'configuration_error' });
  });

  it('requires both public Supabase values for live reads and never enables writes in Phase 6E', () => {
    process.env.EXPO_PUBLIC_WHILOM_DATA_MODE = 'live';
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(getMobileRuntimePolicy()).toMatchObject({ fixtureAllowed: false, liveReadsAllowed: false, liveWritesAllowed: false, status: 'configuration_error' });

    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-key';
    expect(getMobileRuntimePolicy()).toMatchObject({ fixtureAllowed: false, liveReadsAllowed: true, liveWritesAllowed: false, status: 'ready' });
  });
});
