import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BrandMark, EmptyState, ScreenShell } from '../components/WhilomUI';
import { useMobileTheme } from '../theme';

export default function TripsScreen() {
  const theme = useMobileTheme();
  return (
    <ScreenShell>
      <View style={styles.header}><BrandMark eyebrow="YOUR WHILOM" /><Text style={[styles.mode, { color: theme.colors.textFaint }]}>TRAVEL NOTES</Text></View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>Make a day of it.</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Trips will gather the places you want to walk, linger and return to — without pretending to be a road-navigation app.</Text>
        <View style={[styles.feature, { borderRadius: theme.radius.md, backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }]}><Text style={[styles.featureKicker, { color: theme.colors.white }]}>COMING INTO FOCUS</Text><Text style={[styles.featureTitle, { color: theme.colors.white }]}>Trails with a sense of place</Text><Text style={[styles.featureText, { color: `${theme.colors.white}d9` }]}>Collect stops from Discover, shape them into a walking route, and keep the heritage context with you.</Text><Pressable accessibilityRole="button" accessibilityLabel="Browse places in Discover" onPress={() => router.push('/(tabs)/discover')} style={[styles.featureButton, { borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.surfaceRaised }]}><Text style={[styles.featureButtonText, { color: theme.colors.accentStrong }]}>Browse places</Text></Pressable></View>
        <EmptyState icon="⌁" title="No trips yet" detail="Your saved trails and day plans will appear here. The route planner is a future layer; directions will hand off to your device." action="Explore Discover" onAction={() => router.push('/(tabs)/discover')} />
        <View style={[styles.futureList, { borderRadius: theme.radius.md, borderColor: theme.colors.border }]}><Text style={[styles.futureTitle, { color: theme.colors.text }]}>The trip seam is ready for</Text><Text style={[styles.futureItem, { color: theme.colors.textMuted }]}>· walking trails and stops</Text><Text style={[styles.futureItem, { color: theme.colors.textMuted }]}>· day planner and itinerary notes</Text><Text style={[styles.futureItem, { color: theme.colors.textMuted }]}>· offline trip access when native storage is introduced</Text></View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mode: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  content: { paddingHorizontal: 18, paddingTop: 20, gap: 16 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 14, lineHeight: 21 },
  feature: { borderWidth: 1, padding: 20, gap: 8 },
  featureKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  featureTitle: { fontSize: 22, lineHeight: 26, fontWeight: '900', marginTop: 6 },
  featureText: { fontSize: 13, lineHeight: 19 },
  featureButton: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, marginTop: 5, minHeight: 44, justifyContent: 'center' },
  featureButtonText: { fontSize: 12, fontWeight: '900' },
  futureList: { borderWidth: 1, padding: 14, gap: 7 },
  futureTitle: { fontSize: 13, fontWeight: '900', marginBottom: 2 },
  futureItem: { fontSize: 12, lineHeight: 18 },
});
