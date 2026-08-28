import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { tripSchema, type TripInput } from '@whilom/validation';
import { AsyncNotice, BrandMark, EmptyState, ScreenShell, SectionHeader } from '../components/WhilomUI';
import { getMobileRouteRuntime, type MobileRouteSummary } from '../lib/route-source';
import { useMobileSession } from '../lib/session';
import { useMobileTheme } from '../theme';
import { useMobileTrips } from '../lib/trip-state';

function routeMeta(route: MobileRouteSummary) {
  const distance = route.distance_m == null ? 'Distance not recorded' : `${(route.distance_m / 1000).toFixed(1)} km`;
  return `${route.route_type.replace(/_/g, ' ')} · ${distance}${route.duration_minutes ? ` · ${route.duration_minutes} min` : ''}`;
}

function TripCreateForm({ onCreate, busy }: { onCreate: (input: TripInput) => Promise<{ status: string; error?: string }>; busy: boolean }) {
  const theme = useMobileTheme();
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<TripInput['transport']>('walking');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const parsed = tripSchema.safeParse({ name, transport });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Give your trip a name.'); return; }
    setError(null);
    const result = await onCreate(parsed.data);
    if (result.status === 'success') setName('');
    else setError(result.error ?? 'The trip could not be created.');
  }

  return (
    <View style={[styles.createPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.createLabel, { color: theme.colors.textFaint }]}>NEW TRIP</Text>
      <TextInput accessibilityLabel="Trip name" value={name} onChangeText={setName} placeholder="Name this day out" placeholderTextColor={theme.colors.textFaint} style={[styles.createInput, { color: theme.colors.text, borderColor: theme.colors.border }]} />
      <View style={styles.transportRow} accessibilityRole="radiogroup">
        {(['walking', 'cycling', 'driving'] as const).map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={`${option} trip`} accessibilityState={{ selected: transport === option }} onPress={() => setTransport(option)} style={[styles.transportButton, { backgroundColor: transport === option ? theme.colors.accentSoft : theme.colors.surfaceMuted, borderColor: transport === option ? theme.colors.accent : theme.colors.border }]}><Text style={{ color: transport === option ? theme.colors.accentStrong : theme.colors.textMuted }}>{option}</Text></Pressable>)}
      </View>
      {error ? <Text style={[styles.formError, { color: theme.colors.danger }]}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Create trip" disabled={busy} onPress={() => void submit()} style={[styles.createButton, { backgroundColor: theme.colors.accent, minHeight: theme.controls.touchTarget, opacity: busy ? 0.6 : 1 }]}><Text style={{ color: theme.colors.white, fontWeight: '800' }}>{busy ? 'Creating…' : 'Create trip'}</Text></Pressable>
    </View>
  );
}

export default function TripsScreen() {
  const theme = useMobileTheme();
  const session = useMobileSession();
  const runtime = useMemo(() => getMobileRouteRuntime(), []);
  const { trips, createTrip } = useMobileTrips();
  const [routes, setRoutes] = useState<MobileRouteSummary[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [createState, setCreateState] = useState<'idle' | 'submitting'>('idle');

  useEffect(() => {
    let cancelled = false;
    if (runtime.configuration === 'unavailable') { setState('error'); setError(runtime.reason ?? 'Route reads are not configured. No network request was made.'); return () => { cancelled = true; }; }
    setState('loading'); setError(null);
    void runtime.source.getRoutes().then((next) => { if (!cancelled) { setRoutes(next); setState('success'); } }).catch((cause: unknown) => { if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Approved routes could not be loaded.'); setState('error'); } });
    return () => { cancelled = true; };
  }, [retry, runtime]);

  async function handleCreate(input: TripInput) {
    setCreateState('submitting');
    const result = await createTrip(input);
    setCreateState('idle');
    return result;
  }

  return <ScreenShell><View style={styles.header}><BrandMark eyebrow="YOUR WHILOM" /><Text style={[styles.mode, { color: theme.colors.textFaint }]}>{runtime.mode === 'fixture' ? 'DEVELOPMENT ROUTES' : 'LIVE ROUTES'}</Text></View><View style={styles.content}><Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>Make a day of it.</Text><Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Approved trails gather places you can walk, linger and return to. Whilom keeps the heritage context close and leaves navigation to your device.</Text><SectionHeader title="Your trips" detail={session.state.status === 'signed_in' ? `${trips.length} planned trip${trips.length === 1 ? '' : 's'} in this session` : 'Sign in to plan and keep a trip'} />{session.state.status === 'signed_in' ? <><TripCreateForm onCreate={handleCreate} busy={createState === 'submitting'} /><View style={styles.tripStack}>{trips.map((trip) => <Pressable key={trip.id} accessibilityRole="button" accessibilityLabel={`Open trip ${trip.name}`} onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })} style={[styles.tripCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[styles.tripMark, { backgroundColor: theme.colors.accentSoft }]}><Text style={{ color: theme.colors.accentStrong, fontSize: 20 }}>✦</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={[styles.tripName, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>{trip.name}</Text><Text style={[styles.routeMeta, { color: theme.colors.textMuted }]}>{trip.transport ?? 'No transport set'} · {trip.startDate ?? 'Date to decide'}</Text><Text numberOfLines={2} style={[styles.routeDescription, { color: theme.colors.textMuted }]}>{trip.notes ?? 'Open to arrange days and heritage stops.'}</Text></View><Text style={[styles.chevron, { color: theme.colors.textFaint }]}>›</Text></Pressable>)}</View>{!trips.length ? <EmptyState icon="✦" title="No trips yet" detail="Build a small day around the places you want to keep close. Trip changes are session-only in this development mode." /> : null}</> : <EmptyState icon="♙" title="Sign in to plan a trip" detail="Your trip list belongs to your account. The development account is kept in memory for this session." action="Sign in" onAction={() => router.push('/auth/sign-in')} />}<SectionHeader title="Routes and trails" detail={state === 'loading' ? 'Reading bounded approved routes…' : `${routes.length} route${routes.length === 1 ? '' : 's'} available`} />{state === 'error' ? <AsyncNotice kind="error" title="Routes unavailable" detail={error ?? 'Approved routes could not be loaded.'} action="Try again" onAction={() => setRetry((value) => value + 1)} /> : null}<View style={styles.routeStack}>{routes.map((route) => <Pressable key={route.id} accessibilityRole="button" accessibilityLabel={`Open trail ${route.name}`} onPress={() => router.push({ pathname: '/trail/[slug]', params: { slug: route.slug } })} style={[styles.routeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[styles.routeMark, { backgroundColor: theme.colors.accentSoft }]}><Text style={{ color: theme.colors.accentStrong, fontSize: 20 }}>⌁</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={[styles.routeName, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>{route.name}</Text><Text style={[styles.routeMeta, { color: theme.colors.textMuted }]}>{routeMeta(route)}</Text><Text style={[styles.routeDescription, { color: theme.colors.textMuted }]} numberOfLines={2}>{route.description ?? 'An approved Whilom route with ordered heritage stops.'}</Text></View><Text style={[styles.chevron, { color: theme.colors.textFaint }]}>›</Text></Pressable>)}</View>{state === 'success' && !routes.length ? <EmptyState icon="⌁" title="No approved routes yet" detail="When routes are published, they will appear here. Saved trips and itinerary planning will build on this read contract." action="Explore Discover" onAction={() => router.push('/(tabs)/discover')} /> : null}<View style={[styles.futureList, { borderRadius: theme.radius.md, borderColor: theme.colors.border }]}><Text style={[styles.futureTitle, { color: theme.colors.text }]}>Trip foundations</Text><Text style={[styles.futureItem, { color: theme.colors.textMuted }]}>· ordered stops open the same place details as Discover</Text><Text style={[styles.futureItem, { color: theme.colors.textMuted }]}>· fixture trip changes remain in memory; live account writes are capability-gated</Text><Text style={[styles.futureItem, { color: theme.colors.textMuted }]}>· no GPS following, offline packs or automatic rerouting in this phase</Text></View></View></ScreenShell>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mode: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  content: { paddingHorizontal: 18, paddingTop: 20, gap: 16 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 21 },
  createPanel: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 10 },
  createLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  createInput: { borderBottomWidth: 1, minHeight: 44, fontSize: 15 },
  transportRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  transportButton: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 11, paddingVertical: 8 },
  formError: { fontSize: 12 },
  createButton: { borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  tripStack: { gap: 9 },
  tripCard: { borderWidth: 1, borderRadius: 8, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  tripMark: { width: 42, height: 42, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  tripName: { fontSize: 17, lineHeight: 21, fontWeight: '800' },
  routeStack: { gap: 9 },
  routeCard: { borderWidth: 1, borderRadius: 8, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  routeMark: { width: 42, height: 42, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  routeName: { fontSize: 17, lineHeight: 21, fontWeight: '800' },
  routeMeta: { fontSize: 11, textTransform: 'capitalize' },
  routeDescription: { fontSize: 12, lineHeight: 17 },
  chevron: { fontSize: 25 },
  futureList: { borderWidth: 1, padding: 14, gap: 7 },
  futureTitle: { fontSize: 13, fontWeight: '900', marginBottom: 2 },
  futureItem: { fontSize: 12, lineHeight: 18 },
});
