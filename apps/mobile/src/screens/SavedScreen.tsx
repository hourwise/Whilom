import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type DiscoveryPlace } from '@whilom/discovery';
import { AsyncNotice, BrandMark, EmptyState, PlaceCard, SectionHeader, ScreenShell } from '../components/WhilomUI';
import { getMobileDiscoveryRuntime } from '../lib/data-source';
import { useEphemeralPlaceState } from '../lib/ephemeral-state';
import { useMobileTheme } from '../theme';

type LoadState = 'loading' | 'success' | 'error';

export default function SavedScreen() {
  const theme = useMobileTheme();
  const runtime = useMemo(() => getMobileDiscoveryRuntime(), []);
  const { isSaved, toggleSaved } = useEphemeralPlaceState();
  const [places, setPlaces] = useState<DiscoveryPlace[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (runtime.configuration === 'unavailable') {
      setLoadState('error');
      setError('Live mode is selected, but public Supabase configuration is unavailable. No network request was made.');
      return () => { cancelled = true; };
    }
    void runtime.source.getSavedPlaces().then((nextPlaces) => {
      if (cancelled) return;
      setPlaces(nextPlaces);
      setLoadState('success');
    }).catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : 'Saved places could not be loaded.');
      setLoadState('error');
    });
    return () => { cancelled = true; };
  }, [reloadToken, runtime]);

  const savedPlaces = places.filter((place) => isSaved(place.id, place.saved));
  const modeLabel = runtime.configuration === 'unavailable' ? 'LIVE READ · NOT CONFIGURED' : runtime.mode === 'live' ? 'LIVE READ MODE' : 'DEVELOPMENT FIXTURES';

  return (
    <ScreenShell>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <BrandMark eyebrow="YOUR WHILOM" />
        <Text style={[styles.mode, { color: theme.colors.textFaint }]}>{modeLabel}</Text>
      </View>
      <View style={styles.content}>
        <Text style={[styles.kicker, { color: theme.colors.accent }]}>YOUR THREAD THROUGH THE MAP</Text>
        <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>Keep a thread.</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Save places as you find them. Later they can become a day out, a trail, or a reason to turn down an unfamiliar road.</Text>
        <View accessibilityRole="tablist" style={[styles.segment, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text accessibilityRole="tab" accessibilityState={{ selected: true }} style={[styles.segmentActive, { color: theme.colors.accent, borderBottomColor: theme.colors.accent }]}>Saved places</Text>
          <Text accessibilityRole="tab" accessibilityState={{ selected: false }} style={[styles.segmentInactive, { color: theme.colors.textFaint }]}>Wishlist · soon</Text>
        </View>
        <SectionHeader title="Your saved places" detail={loadState === 'loading' ? 'Reading your saved-place source…' : `${savedPlaces.length} in this ${runtime.mode === 'fixture' ? 'development profile' : 'account view'}`} action="Discover" onAction={() => router.push('/(tabs)/discover')} />
        {error ? <AsyncNotice kind="error" title="Saved places unavailable" detail={error} action="Try again" onAction={() => setReloadToken((current) => current + 1)} /> : null}
        <View style={styles.stack}>
          {savedPlaces.map((place) => <PlaceCard key={place.id} place={place} compact onSave={() => toggleSaved(place.id, place.saved)} onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} />)}
        </View>
        {loadState === 'success' && !savedPlaces.length ? <EmptyState icon="♡" title="Nothing saved yet" detail={runtime.mode === 'live' ? 'Account-backed saved places will appear here when personal persistence is connected. You can continue exploring in the meantime.' : 'When a place stays with you, save it here for later.'} action="Start discovering" onAction={() => router.push('/(tabs)/discover')} /> : null}
        <View style={[styles.note, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}><Text style={[styles.noteTitle, { color: theme.colors.accentStrong }]}>EPHEMERAL PRESENTATION STATE</Text><Text style={[styles.noteText, { color: theme.colors.textMuted }]}>This phase keeps save and visited interactions in memory only. The data-source boundary is ready for account persistence; nothing is written to device storage or Supabase.</Text></View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  mode: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 14 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 14, lineHeight: 21 },
  segment: { borderWidth: 1, borderRadius: 8, flexDirection: 'row', paddingHorizontal: 14, gap: 18 },
  segmentActive: { paddingVertical: 11, fontSize: 12, fontWeight: '900', borderBottomWidth: 2 },
  segmentInactive: { paddingVertical: 11, fontSize: 12, fontWeight: '700' },
  stack: { gap: 9 },
  note: { borderWidth: 1, borderRadius: 8, padding: 13, gap: 4 },
  noteTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  noteText: { fontSize: 12, lineHeight: 17 },
});
