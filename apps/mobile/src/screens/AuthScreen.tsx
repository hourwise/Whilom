import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { AsyncNotice, BrandMark, ScreenShell } from '../components/WhilomUI';
import { useMobileSession } from '../lib/session';
import { fieldErrorsFromZod, type ActionState } from '../lib/action-state';
import { credentialsSchema, signUpSchema, type CredentialsInput, type SignUpInput } from '@whilom/validation';
import { useMobileTheme } from '../theme';

export default function AuthScreen({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const theme = useMobileTheme();
  const { state: session, signIn, signUp } = useMobileSession();
  const [email, setEmail] = useState(mode === 'sign-in' ? 'fixture@whilom.test' : '');
  const [password, setPassword] = useState(mode === 'sign-in' ? 'whilom-demo' : '');
  const [displayName, setDisplayName] = useState('');
  const [result, setResult] = useState<ActionState<unknown>>({ status: 'idle' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isSignUp = mode === 'sign-up';
  const schema = isSignUp ? signUpSchema : credentialsSchema;

  async function submit() {
    const input = isSignUp ? { email, password, displayName } : { email, password };
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromZod(parsed.error));
      setResult({ status: 'error', error: 'Check the highlighted fields.' });
      return;
    }
    setFieldErrors({});
    setResult({ status: 'submitting' });
    const next = isSignUp ? await signUp(parsed.data as SignUpInput) : await signIn(parsed.data as CredentialsInput);
    setResult(next);
    if (next.status === 'success') router.replace('/(tabs)/profile');
    else if (next.fieldErrors) setFieldErrors(next.fieldErrors);
  }

  const labelStyle = { color: theme.colors.text };
  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.back, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text }}>‹</Text></Pressable><BrandMark eyebrow="YOUR WHILOM" /><View style={{ width: 44 }} /></View>
        <View style={styles.intro}><Text style={[styles.kicker, { color: theme.colors.accent }]}>YOUR THREAD THROUGH THE MAP</Text><Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>{isSignUp ? 'Create an account.' : 'Welcome back.'}</Text><Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{isSignUp ? 'Keep saved places, visits and careful contributions together.' : 'Return to the places and notes you have gathered.'}</Text></View>
        {session.mode === 'fixture' ? <AsyncNotice kind="loading" title="Development account" detail="Fixture mode stays in memory. Try fixture@whilom.test with whilom-demo, or create a local demo account." /> : null}
        {session.configuration === 'unavailable' ? <AsyncNotice kind="error" title="Live account mode is not configured" detail="No network request was made. Provide public Supabase configuration or return to fixture mode." /> : null}
        {result.status === 'error' ? <AsyncNotice kind="error" title="Could not complete that" detail={result.error ?? 'Please check the form and try again.'} /> : null}
        <View style={[styles.form, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {isSignUp ? <Field label="Display name" value={displayName} onChangeText={setDisplayName} error={fieldErrors.displayName} placeholder="How Whilom should address you" /> : null}
          <Field label="Email" value={email} onChangeText={setEmail} error={fieldErrors.email} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
          <Field label="Password" value={password} onChangeText={setPassword} error={fieldErrors.password} placeholder="At least 8 characters" secureTextEntry />
          <Pressable accessibilityRole="button" accessibilityLabel={isSignUp ? 'Create account' : 'Sign in'} accessibilityState={{ disabled: result.status === 'submitting' }} disabled={result.status === 'submitting'} onPress={() => void submit()} style={[styles.submit, { backgroundColor: theme.colors.accent, minHeight: theme.controls.touchTarget }]}><Text style={[styles.submitText, { color: theme.colors.white }]}>{result.status === 'submitting' ? 'Working…' : isSignUp ? 'Create account' : 'Sign in'}</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={isSignUp ? 'Switch to sign in' : 'Switch to create account'} onPress={() => router.replace(isSignUp ? '/auth/sign-in' : '/auth/sign-up')}><Text style={[styles.switch, { color: theme.colors.accent }]}>{isSignUp ? 'Already have an account? Sign in' : 'New to Whilom? Create an account'}</Text></Pressable>
      </ScrollView>
    </ScreenShell>
  );
}

function Field({ label, value, onChangeText, error, placeholder, secureTextEntry, autoCapitalize = 'sentences', keyboardType = 'default' }: { label: string; value: string; onChangeText: (value: string) => void; error?: string; placeholder: string; secureTextEntry?: boolean; autoCapitalize?: 'none' | 'sentences'; keyboardType?: 'default' | 'email-address' }) {
  const theme = useMobileTheme();
  return <View style={styles.field}><Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.colors.textFaint} secureTextEntry={secureTextEntry} autoCapitalize={autoCapitalize} keyboardType={keyboardType} style={[styles.input, { color: theme.colors.text, borderColor: error ? theme.colors.danger : theme.colors.border, backgroundColor: theme.colors.surfaceMuted, minHeight: theme.controls.fieldHeight }]} />{error ? <Text style={[styles.error, { color: theme.colors.danger }]}>{error}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 42, gap: 18 },
  header: { paddingHorizontal: 16, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { width: 44, height: 44, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  intro: { paddingHorizontal: 16, paddingTop: 20, gap: 7 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 21 },
  form: { marginHorizontal: 16, borderWidth: 1, borderRadius: 8, padding: 16, gap: 14 },
  field: { gap: 5 },
  fieldLabel: { fontSize: 12, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, fontSize: 15 },
  error: { fontSize: 11 },
  submit: { borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  submitText: { fontSize: 13, fontWeight: '900' },
  switch: { alignSelf: 'center', fontSize: 13, fontWeight: '800', padding: 8 },
});
