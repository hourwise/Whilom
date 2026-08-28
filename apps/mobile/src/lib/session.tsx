import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { credentialsSchema, signUpSchema, type CredentialsInput, type SignUpInput } from '@whilom/validation';
import { getMobileRuntimePolicy } from './runtime';
import { getMobileSupabaseClient } from './supabase';
import { actionError, type ActionState, fieldErrorsFromZod } from './action-state';
import { createLiveAuthAdapter, mobileUserFromSupabase } from './live-adapters';

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

function invalid<T>(fieldErrors: Record<string, string>): ActionState<T> {
  return { status: 'error', error: 'Check the highlighted fields.', fieldErrors };
}

/**
 * Session state is intentionally in memory. Fixture mode starts signed in so
 * the product shell is useful immediately; the Profile screen can sign out
 * and exercise the signed-out path. No native persistence is introduced.
 */
export function MobileSessionProvider({ children }: { children: ReactNode }) {
  const policy = getMobileRuntimePolicy();
  const { requestedMode: mode } = policy;
  const client = useMemo(() => policy.liveReadsAllowed ? getMobileSupabaseClient() : null, [policy.liveReadsAllowed]);
  const liveAuth = useMemo(() => client ? createLiveAuthAdapter(client) : null, [client]);
  const [state, setState] = useState<MobileSessionState>(() => policy.fixtureAllowed
    ? { mode, configuration: 'available', status: 'loading', user: null }
    : { mode, configuration: client ? 'available' : 'unavailable', status: 'error', user: null, error: policy.reason });

  useEffect(() => {
    let cancelled = false;
    if (policy.fixtureAllowed) {
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
      setState({ mode, configuration: 'available', status: user ? 'signed_in' : 'signed_out', user: user ? mobileUserFromSupabase(user) : null });
    }).catch((error: unknown) => {
      if (!cancelled) setState({ mode, configuration: 'available', status: 'error', user: null, error: error instanceof Error ? error.message : 'Session could not be read.' });
    });
    const subscription = client.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const user = session?.user;
      setState({ mode, configuration: 'available', status: user ? 'signed_in' : 'signed_out', user: user ? mobileUserFromSupabase(user) : null });
    });
    return () => { cancelled = true; subscription.data.subscription.unsubscribe(); };
  }, [client, mode, policy.fixtureAllowed]);

  const signIn = useCallback(async (input: CredentialsInput): Promise<ActionState<MobileSessionUser>> => {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) return invalid(fieldErrorsFromZod(parsed.error));
    if (policy.fixtureAllowed) {
      setState({ mode, configuration: 'available', status: 'signed_in', user: { ...fixtureUser, email: parsed.data.email } });
      return { status: 'success', data: { ...fixtureUser, email: parsed.data.email } };
    }
    if (!policy.liveWritesAllowed || !liveAuth) return { status: 'error', error: policy.reason ?? 'Live sign-in is disabled.' };
    try {
      const user = await liveAuth.signIn(parsed.data);
      setState({ mode, configuration: 'available', status: 'signed_in', user });
      return { status: 'success', data: user };
    } catch (error) {
      return actionError(error, 'Sign-in failed.') as ActionState<MobileSessionUser>;
    }
  }, [liveAuth, mode, policy.fixtureAllowed, policy.liveWritesAllowed, policy.reason]);

  const signUp = useCallback(async (input: SignUpInput): Promise<ActionState<MobileSessionUser>> => {
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) return invalid(fieldErrorsFromZod(parsed.error));
    if (policy.fixtureAllowed) {
      const user = { ...fixtureUser, email: parsed.data.email, displayName: parsed.data.displayName };
      setState({ mode, configuration: 'available', status: 'signed_in', user });
      return { status: 'success', data: user };
    }
    if (!policy.liveWritesAllowed || !liveAuth) return { status: 'error', error: policy.reason ?? 'Live account creation is disabled.' };
    try {
      const user = await liveAuth.signUp(parsed.data);
      if (!user) return { status: 'success' };
      setState({ mode, configuration: 'available', status: 'signed_in', user });
      return { status: 'success', data: user };
    } catch (error) {
      return actionError(error, 'Account creation failed.') as ActionState<MobileSessionUser>;
    }
  }, [liveAuth, mode, policy.fixtureAllowed, policy.liveWritesAllowed, policy.reason]);

  const signOut = useCallback(async (): Promise<ActionState> => {
    if (policy.fixtureAllowed) {
      setState({ mode, configuration: 'available', status: 'signed_out', user: null });
      return { status: 'success' };
    }
    if (!policy.liveWritesAllowed || !liveAuth) return { status: 'error', error: policy.reason ?? 'Live sign-out is disabled.' };
    try {
      await liveAuth.signOut();
      setState({ mode, configuration: 'available', status: 'signed_out', user: null });
      return { status: 'success' };
    } catch (error) {
      return actionError(error, 'Sign-out failed.');
    }
  }, [liveAuth, mode, policy.fixtureAllowed, policy.liveWritesAllowed, policy.reason]);

  const value = useMemo(() => ({ state, signIn, signUp, signOut }), [signIn, signOut, signUp, state]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useMobileSession(): MobileSessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useMobileSession must be used inside MobileSessionProvider');
  return value;
}

export { fixtureUser };
