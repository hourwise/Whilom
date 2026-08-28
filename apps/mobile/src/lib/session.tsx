import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { credentialsSchema, signUpSchema, type CredentialsInput, type SignUpInput } from '@whilom/validation';
import { getMobileSupabaseClient } from './supabase';
import { actionError, type ActionState, fieldErrorsFromZod } from './action-state';

export type MobileSessionMode = 'fixture' | 'live';
export type MobileSessionStatus = 'loading' | 'signed_out' | 'signed_in' | 'error';

export interface MobileSessionUser {
  id: string;
  email: string;
  displayName: string;
}

export interface MobileSessionState {
  mode: MobileSessionMode;
  configuration: 'available' | 'unavailable';
  status: MobileSessionStatus;
  user: MobileSessionUser | null;
  error?: string;
}

interface MobileSessionContextValue {
  state: MobileSessionState;
  signIn(input: CredentialsInput): Promise<ActionState<MobileSessionUser>>;
  signUp(input: SignUpInput): Promise<ActionState<MobileSessionUser>>;
  signOut(): Promise<ActionState>;
}

const fixtureUser: MobileSessionUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'fixture@whilom.test',
  displayName: 'Field notes',
};

const SessionContext = createContext<MobileSessionContextValue | null>(null);

function requestedMode(): MobileSessionMode {
  return process.env.EXPO_PUBLIC_WHILOM_DATA_MODE?.trim().toLowerCase() === 'live' ? 'live' : 'fixture';
}

function userFromSupabase(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): MobileSessionUser {
  const displayName = typeof user.user_metadata?.display_name === 'string' && user.user_metadata.display_name.trim()
    ? user.user_metadata.display_name.trim()
    : user.email?.split('@')[0] ?? 'Whilom member';
  return { id: user.id, email: user.email ?? '', displayName };
}

function invalid<T>(fieldErrors: Record<string, string>): ActionState<T> {
  return { status: 'error', error: 'Check the highlighted fields.', fieldErrors };
}

/**
 * Session state is intentionally in memory. Fixture mode starts signed in so
 * the product shell is useful immediately; the Profile screen can sign out
 * and exercise the signed-out path. No native persistence is introduced.
 */
export function MobileSessionProvider({ children }: { children: ReactNode }) {
  const mode = requestedMode();
  const client = useMemo(() => mode === 'live' ? getMobileSupabaseClient() : null, [mode]);
  const [state, setState] = useState<MobileSessionState>(() => mode === 'fixture'
    ? { mode, configuration: 'available', status: 'loading', user: null }
    : { mode, configuration: client ? 'available' : 'unavailable', status: client ? 'loading' : 'error', user: null, error: client ? undefined : 'Live mode is not configured. Add the public Supabase URL and anon key to enable account reads.' });

  useEffect(() => {
    let cancelled = false;
    if (mode === 'fixture') {
      const timer = setTimeout(() => {
        if (!cancelled) setState({ mode, configuration: 'available', status: 'signed_in', user: fixtureUser });
      }, 0);
      return () => { cancelled = true; clearTimeout(timer); };
    }
    if (!client) return () => { cancelled = true; };
    void client.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setState({ mode, configuration: 'available', status: 'error', user: null, error: error.message });
        return;
      }
      const user = data.session?.user;
      setState({ mode, configuration: 'available', status: user ? 'signed_in' : 'signed_out', user: user ? userFromSupabase(user) : null });
    }).catch((error: unknown) => {
      if (!cancelled) setState({ mode, configuration: 'available', status: 'error', user: null, error: error instanceof Error ? error.message : 'Session could not be read.' });
    });
    const subscription = client.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const user = session?.user;
      setState({ mode, configuration: 'available', status: user ? 'signed_in' : 'signed_out', user: user ? userFromSupabase(user) : null });
    });
    return () => { cancelled = true; subscription.data.subscription.unsubscribe(); };
  }, [client, mode]);

  const signIn = useCallback(async (input: CredentialsInput): Promise<ActionState<MobileSessionUser>> => {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) return invalid(fieldErrorsFromZod(parsed.error));
    if (mode === 'fixture') {
      setState({ mode, configuration: 'available', status: 'signed_in', user: { ...fixtureUser, email: parsed.data.email } });
      return { status: 'success', data: { ...fixtureUser, email: parsed.data.email } };
    }
    return { status: 'error', error: 'Live sign-in is intentionally dormant in this remote behaviour slice.' };
  }, [mode]);

  const signUp = useCallback(async (input: SignUpInput): Promise<ActionState<MobileSessionUser>> => {
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) return invalid(fieldErrorsFromZod(parsed.error));
    if (mode === 'fixture') {
      const user = { ...fixtureUser, email: parsed.data.email, displayName: parsed.data.displayName };
      setState({ mode, configuration: 'available', status: 'signed_in', user });
      return { status: 'success', data: user };
    }
    return { status: 'error', error: 'Live account creation is intentionally dormant in this remote behaviour slice.' };
  }, [mode]);

  const signOut = useCallback(async (): Promise<ActionState> => {
    if (mode === 'fixture') {
      setState({ mode, configuration: 'available', status: 'signed_out', user: null });
      return { status: 'success' };
    }
    return { status: 'error', error: 'Live sign-out is intentionally dormant in this remote behaviour slice.' };
  }, [mode]);

  const value = useMemo(() => ({ state, signIn, signUp, signOut }), [signIn, signOut, signUp, state]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useMobileSession(): MobileSessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useMobileSession must be used inside MobileSessionProvider');
  return value;
}

export { fixtureUser };
