import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandMark, ScreenShell, SectionHeader } from '../components/WhilomUI';
import { useMobileTheme } from '../theme';

const rows = [
  { icon: '◷', label: 'Visit history', detail: 'Places you have explored' },
  { icon: '✎', label: 'Reviews and notes', detail: 'Your observations, when you are ready' },
  { icon: '＋', label: 'Contributions', detail: 'Corrections and source-led additions' },
  { icon: '⚙', label: 'Settings', detail: 'Account, display and privacy' },
];

export default function ProfileScreen() {
  const theme = useMobileTheme();
  return (
    <ScreenShell>
      <View style={styles.header}><BrandMark eyebrow="YOUR WHILOM" /><Text style={[styles.mode, { color: theme.colors.textFaint }]}>PROFILE</Text></View>
      <View style={styles.content}>
        <View style={[styles.identity, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}><Text style={[styles.avatarText, { color: theme.colors.accentStrong }]}>F</Text></View><View style={{ flex: 1 }}><Text style={[styles.name, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>Field notes</Text><Text style={[styles.email, { color: theme.colors.textMuted }]}>Local development profile · sign in later</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => undefined}><Text style={[styles.edit, { color: theme.colors.accent }]}>Edit</Text></Pressable></View>
        <View style={[styles.stats, { backgroundColor: theme.colors.accentSoft }]}><View><Text style={[styles.statValue, { color: theme.colors.accentStrong }]}>0</Text><Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>visits</Text></View><View><Text style={[styles.statValue, { color: theme.colors.accentStrong }]}>2</Text><Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>saved</Text></View><View><Text style={[styles.statValue, { color: theme.colors.accentStrong }]}>—</Text><Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>contributions</Text></View></View>
        <SectionHeader title="Your account" detail="A calm place for your own thread through the map." />
        <View style={[styles.menu, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>{rows.map((row) => <Pressable key={row.label} accessibilityRole="button" onPress={() => undefined} style={[styles.menuRow, { borderBottomColor: theme.colors.border }]}><Text style={[styles.menuIcon, { color: theme.colors.accent }]}>{row.icon}</Text><View style={{ flex: 1 }}><Text style={[styles.menuLabel, { color: theme.colors.text }]}>{row.label}</Text><Text style={[styles.menuDetail, { color: theme.colors.textMuted }]}>{row.detail}</Text></View><Text style={[styles.chevron, { color: theme.colors.textFaint }]}>›</Text></Pressable>)}</View>
        <View style={[styles.note, { backgroundColor: theme.colors.surfaceMuted }]}><Text style={[styles.noteLabel, { color: theme.colors.textFaint }]}>ACCOUNT SEAM</Text><Text style={[styles.noteText, { color: theme.colors.textMuted }]}>Authentication and personal persistence remain behind the existing Supabase client boundary. This phase keeps the profile presentation lightweight and cross-platform.</Text></View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mode: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  content: { paddingHorizontal: 18, paddingTop: 20, gap: 16 },
  identity: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '900' },
  name: { fontSize: 16, fontWeight: '900' },
  email: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  edit: { fontSize: 12, fontWeight: '900' },
  stats: { borderRadius: 16, padding: 17, flexDirection: 'row', justifyContent: 'space-between' },
  statValue: { fontSize: 24, lineHeight: 27, fontWeight: '900' },
  statLabel: { fontSize: 11, marginTop: 2 },
  menu: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  menuRow: { minHeight: 68, borderBottomWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  menuIcon: { fontSize: 19, width: 24, textAlign: 'center' },
  menuLabel: { fontSize: 14, fontWeight: '800' },
  menuDetail: { fontSize: 11, marginTop: 2 },
  chevron: { fontSize: 25 },
  note: { borderRadius: 14, padding: 14, gap: 5 },
  noteLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  noteText: { fontSize: 12, lineHeight: 18 },
});
