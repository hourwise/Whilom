import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AsyncNotice, BrandMark, EmptyState, ScreenShell, SectionHeader } from '../components/WhilomUI';
import { getMobileRouteRuntime, type MobileRouteSummary } from '../lib/route-source';
import { useMobileTheme } from '../theme';

function routeMeta(route: MobileRouteSummary) {
  const distance = route.distance_m == null ? 'Distance not recorded' : `${(route.distance_m / 1000).toFixed(1)} km`;
  return `${route.route_type.replace(/_/g, ' ')} · ${distance}${route.duration_minutes ? ` · ${route.duration_minutes} min` : ''}`;
}

export default function TripsScreen() {
  const theme = useMobileTheme();
  const runtime = useMemo(() => getMobileRouteRuntime(), []);
  const [routes, setRoutes] = useState<MobileRouteSummary[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (runtime.configuration === 'unavailable') { setState('error'); setError('Live route reads are not configured. No network request was made.'); return () => { cancelled = true; }; }
    setState('loading'); setError(null);
    void runtime.source.getRoutes().then((next) => { if (!cancelled) { setRoutes(next); setState('success'); } }).catch((cause: unknown) => { if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Approved routes could not be loaded.'); setState('error'); } });
    return () => { cancelled = true; };
  }, [retry, runtime]);
  return <ScreenShell><View style={styles.header}><BrandMark eyebrow="YOUR WHILOM" /><Text style={[styles.mode, { color: theme.colors.textFaint }]}>{runtime.mode === 'fixture' ? 'DEVELOPMENT ROUTES' : 'LIVE ROUTES'}</Text></View><View style={styles.content}><Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>Make a day of it.</Text><Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Approved trails gather places you can walk, linger and return to. Whilom keeps the heritage context close and leaves navigation to your device.</Text><SectionHeader title="Routes and trails" detail={state === 'loading' ? 'Reading bounded approved routes…' : `${routes.length} route${routes.length === 1 ? '' : 's'} available`} />{state === 'error' ? <AsyncNotice kind="error" title="Routes unavailable" detail={error ?? 'Approved routes could not be loaded.'} action="Try again" onAction={() => setRetry((value) => value + 1)} /> : null}<View style={styles.routeStack}>{routes.map((route) => <Pressable key={route.id} accessibilityRole="button" accessibilityLabel={`Open trail ${route.name}`} onPress={() => router.push({ pathname: '/trail/[slug]', params: { slug: route.slug } })} style={[styles.routeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[styles.routeMark, { backgroundColor: theme.colors.accentSoft }]}><Text style={{ color: theme.colors.accentStrong, fontSize: 20 }}>⌁</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={[styles.routeName, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>{route.name}</Text><Text style={[styles.routeMeta, { color: theme.colors.textMuted }]}>{routeMeta(route)}</Text><Text style={[styles.routeDescription, { color: theme.colors.textMuted }]} numberOfLines={2}>{route.description ?? 'An approved Whilom route with ordered heritage stops.'}</Text></View><Text style={[styles.chevron, { color: theme.colors.textFaint }]}>›</Text></Pressable>)}</View>{state === 'success' && !routes.length ? <EmptyState icon="⌁" title="No approved routes yet" detail="When routes are published, they will appear here. Saved trips and itinerary planning will build on this read contract." action="Explore Discover" onAction={() => router.push('/(tabs)/discover')} /> : null}<View style={[styles.futureList, { borderRadius: theme.radius.md, borderColor: theme.colors.border }]}><Text style={[styles.futureTitle, { color: theme.colors.text }]}>Trip foundations</Text><Text style={[styles.futureItem, { color: theme.colors.textMuted }]}>· ordered stops open the same place details as Discover</Text><Text style={[styles.futureItem, { color: theme.colors.textMuted }]}>· day planner and saved trip mutations remain future account work</Text><Text style={[styles.futureItem, { color: theme.colors.textMuted }]}>· no GPS following, offline packs or automatic rerouting in this phase</Text></View></View></ScreenShell>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mode: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  content: { paddingHorizontal: 18, paddingTop: 20, gap: 16 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 21 },
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
