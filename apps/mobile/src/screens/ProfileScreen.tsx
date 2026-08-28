import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AsyncNotice, BrandMark, EmptyState, ScreenShell, SectionHeader } from '../components/WhilomUI';
import { useMobileBehaviour } from '../lib/behaviour';
import { useMobileSession } from '../lib/session';
import { developmentDataSource } from '../lib/fixtures';
import type { ActionState } from '../lib/action-state';
import { useMobileTheme } from '../theme';

const rows = [
  { icon: '◷', label: 'Visit history', detail: 'Places you have explored' },
  { icon: '✎', label: 'Reviews and notes', detail: 'Your observations, when you are ready' },
  { icon: '＋', label: 'Contributions', detail: 'Corrections and source-led additions' },
  { icon: '⚙', label: 'Settings', detail: 'Account, display and privacy' },
];

export default function ProfileScreen() {
  const theme = useMobileTheme();
  const { state: session, signOut } = useMobileSession();
  const { savedPlaceIds, visits, reviews, corrections } = useMobileBehaviour();
  const [signOutState, setSignOutState] = useState<ActionState>({ status: 'idle' });

  async function handleSignOut() {
    setSignOutState({ status: 'submitting' });
    setSignOutState(await signOut());
  }

  if (session.status !== 'signed_in') return <ScreenShell><View style={styles.header}><BrandMark eyebrow="YOUR WHILOM" /><Text style={[styles.mode, { color: theme.colors.textFaint }]}>PROFILE</Text></View><View style={styles.content}><EmptyState icon="♙" title="Your thread starts here" detail={session.status === 'error' ? session.error ?? 'Your account could not be read.' : 'Sign in to keep saved places, visits and careful contributions together.'} action="Sign in" onAction={() => router.push('/auth/sign-in')} /><Pressable accessibilityRole="button" accessibilityLabel="Create a Whilom account" onPress={() => router.push('/auth/sign-up')} style={[styles.secondaryAction, { borderColor: theme.colors.border, minHeight: theme.controls.touchTarget }]}><Text style={{ color: theme.colors.accent, fontWeight: '800' }}>Create an account</Text></Pressable></View></ScreenShell>;

  const initial = session.user?.displayName.charAt(0).toUpperCase() ?? 'W';
  return <ScreenShell><View style={styles.header}><BrandMark eyebrow="YOUR WHILOM" /><Text style={[styles.mode, { color: theme.colors.textFaint }]}>PROFILE</Text></View><View style={styles.content}><View style={[styles.identity, { borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}><Text style={[styles.avatarText, { color: theme.colors.accentStrong }]}>{initial}</Text></View><View style={{ flex: 1 }}><Text style={[styles.name, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>{session.user?.displayName}</Text><Text style={[styles.email, { color: theme.colors.textMuted }]}>{session.user?.email} · fixture session</Text></View></View><View style={[styles.stats, { borderRadius: theme.radius.md, backgroundColor: theme.colors.accentSoft }]}><View><Text style={[styles.statValue, { color: theme.colors.accentStrong }]}>{visits.length}</Text><Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>visits</Text></View><View><Text style={[styles.statValue, { color: theme.colors.accentStrong }]}>{savedPlaceIds.length}</Text><Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>saved</Text></View><View><Text style={[styles.statValue, { color: theme.colors.accentStrong }]}>{reviews.length + corrections.length}</Text><Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>contributions</Text></View></View><SectionHeader title="Your account" detail="A calm place for your own thread through the map." /><View style={[styles.menu, { borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>{rows.map((row) => <Pressable key={row.label} accessibilityRole="button" accessibilityLabel={`${row.label}: ${row.detail}`} onPress={() => undefined} style={[styles.menuRow, { minHeight: theme.controls.touchTarget + 20, borderBottomColor: theme.colors.border }]}><Text style={[styles.menuIcon, { color: theme.colors.accent }]}>{row.icon}</Text><View style={{ flex: 1 }}><Text style={[styles.menuLabel, { color: theme.colors.text }]}>{row.label}</Text><Text style={[styles.menuDetail, { color: theme.colors.textMuted }]}>{row.detail}</Text></View><Text style={[styles.chevron, { color: theme.colors.textFaint }]}>›</Text></Pressable>)}</View><SectionHeader title="Recent visits" detail="Fixture activity is visible for this session only." />{visits.length ? <View style={styles.activity}>{visits.slice(0, 3).map((visit) => <View key={visit.id} style={[styles.activityRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.activityName, { color: theme.colors.text }]}>{developmentDataSource.placeById(visit.placeId)?.name ?? visit.placeId}</Text><Text style={[styles.menuDetail, { color: theme.colors.textMuted }]}>{visit.visitedOn ?? 'Date not recorded'}{visit.publicNote ? ` · ${visit.publicNote}` : ''}</Text></View><Text style={{ color: theme.colors.accent }}>✓</Text></View>)}</View> : <Text style={[styles.muted, { color: theme.colors.textMuted }]}>No visits recorded yet.</Text>}{signOutState.status === 'error' ? <AsyncNotice kind="error" title="Could not sign out" detail={signOutState.error ?? 'Try again.'} /> : null}<Pressable accessibilityRole="button" accessibilityLabel="Sign out" disabled={signOutState.status === 'submitting'} onPress={() => void handleSignOut()} style={[styles.signOut, { borderColor: theme.colors.border, minHeight: theme.controls.touchTarget, opacity: signOutState.status === 'submitting' ? 0.6 : 1 }]}><Text style={{ color: theme.colors.accent, fontWeight: '800' }}>{signOutState.status === 'submitting' ? 'Signing out…' : 'Sign out'}</Text></Pressable><View style={[styles.note, { borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceMuted }]}><Text style={[styles.noteLabel, { color: theme.colors.textFaint }]}>SESSION-ONLY FIXTURE</Text><Text style={[styles.noteText, { color: theme.colors.textMuted }]}>This demo account, its visits and contributions live only in memory. Future production persistence will use authenticated Supabase rows and RLS.</Text></View></View></ScreenShell>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mode: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
  identity: { borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '900' },
  name: { fontSize: 18, fontWeight: '900' },
  email: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  stats: { padding: 16, flexDirection: 'row', justifyContent: 'space-between' },
  statValue: { fontSize: 24, lineHeight: 27, fontWeight: '900' },
  statLabel: { fontSize: 11, marginTop: 2 },
  menu: { borderWidth: 1, overflow: 'hidden' },
  menuRow: { minHeight: 68, borderBottomWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  menuIcon: { fontSize: 19, width: 24, textAlign: 'center' },
  menuLabel: { fontSize: 14, fontWeight: '800' },
  menuDetail: { fontSize: 11, marginTop: 2 },
  chevron: { fontSize: 25 },
  activity: { gap: 8 },
  activityRow: { minHeight: 58, borderWidth: 1, borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityName: { fontSize: 13, fontWeight: '800' },
  muted: { fontSize: 12, lineHeight: 18 },
  signOut: { borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryAction: { alignSelf: 'center', borderWidth: 1, borderRadius: 4, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  note: { padding: 14, gap: 5 },
  noteLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  noteText: { fontSize: 12, lineHeight: 18 },
});
