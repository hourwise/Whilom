import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BrandMark, EmptyState, PlaceCard, SectionHeader, ScreenShell } from '../components/WhilomUI';
import { developmentDataSource } from '../lib/fixtures';
import { useMobileTheme } from '../theme';

export default function SavedScreen() {
  const theme = useMobileTheme();
  const savedPlaces = developmentDataSource.places.filter((place) => place.saved);
  return (
    <ScreenShell>
      <View style={styles.header}><BrandMark eyebrow="YOUR WHILOM" /><Text style={[styles.mode, { color: theme.colors.textFaint }]}>DEMO PROFILE</Text></View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Keep a thread.</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Save places as you find them. Later they can become a day out, a trail, or a reason to turn down an unfamiliar road.</Text>
        <View style={[styles.segment, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[styles.segmentActive, { color: theme.colors.accent, borderBottomColor: theme.colors.accent }]}>Saved places</Text><Text style={[styles.segmentInactive, { color: theme.colors.textFaint }]}>Wishlist · soon</Text></View>
        <SectionHeader title="Your saved places" detail={`${savedPlaces.length} in this development profile`} action="Discover" onAction={() => router.push('/(tabs)/discover')} />
        <View style={styles.stack}>{savedPlaces.map((place) => <PlaceCard key={place.id} place={place} compact onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} />)}</View>
        {!savedPlaces.length ? <EmptyState icon="♡" title="Nothing saved yet" detail="When a place stays with you, save it here for later." action="Start discovering" onAction={() => router.push('/(tabs)/discover')} /> : null}
        <View style={[styles.note, { backgroundColor: theme.colors.accentSoft }]}><Text style={[styles.noteTitle, { color: theme.colors.accentStrong }]}>A truthful beginning</Text><Text style={[styles.noteText, { color: theme.colors.textMuted }]}>This shell uses development-only fixtures. Saved state will move behind the account data seam when authentication and persistence are connected.</Text></View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mode: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  content: { paddingHorizontal: 18, paddingTop: 20, gap: 14 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 14, lineHeight: 21 },
  segment: { borderWidth: 1, borderRadius: 12, flexDirection: 'row', paddingHorizontal: 14, gap: 18 },
  segmentActive: { paddingVertical: 11, fontSize: 12, fontWeight: '900', borderBottomWidth: 2 },
  segmentInactive: { paddingVertical: 11, fontSize: 12, fontWeight: '700' },
  stack: { gap: 9 },
  note: { borderRadius: 14, padding: 13, gap: 4 },
  noteTitle: { fontSize: 12, fontWeight: '900' },
  noteText: { fontSize: 12, lineHeight: 17 },
});

