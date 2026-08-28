import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AsyncNotice, BrandMark, EmptyState, SectionHeader } from '../components/WhilomUI';
import type { MobileRouteDataSource, MobileRouteStop, MobileRouteSummary } from '../lib/route-source';
import { useMobileTheme } from '../theme';

function distance(value: number | null) { return value == null ? 'Distance not recorded' : `${(value / 1000).toFixed(1)} km`; }

export default function RouteDetailScreen({ route, source }: { route: MobileRouteSummary; source: MobileRouteDataSource }) {
  const theme = useMobileTheme();
  const [stops, setStops] = useState<MobileRouteStop[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState('loading'); setError(null);
    void source.getRouteStops(route.id).then((next) => { if (!cancelled) { setStops(next); setState('success'); } }).catch((cause: unknown) => { if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Route stops could not be loaded.'); setState('error'); } });
    return () => { cancelled = true; };
  }, [retry, route.id, source]);
  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}><View style={styles.topBar}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.back, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text, fontSize: 30 }}>‹</Text></Pressable><BrandMark eyebrow="TRAIL DETAIL" /><View style={{ width: theme.controls.touchTarget }} /></View><View style={[styles.hero, { backgroundColor: theme.colors.accent }]}><Text style={[styles.kicker, { color: `${theme.colors.white}c7` }]}>{route.route_type.replace(/_/g, ' ').toUpperCase()}  ·  {route.difficulty ?? 'DIFFICULTY NOT RECORDED'}</Text><Text style={[styles.title, { color: theme.colors.white, fontFamily: theme.typography.editorial }]}>{route.name}</Text><Text style={[styles.description, { color: `${theme.colors.white}e0` }]}>{route.description ?? 'An approved Whilom route with ordered heritage stops.'}</Text></View><View style={[styles.meta, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View><Text style={[styles.metaValue, { color: theme.colors.text }]}>{distance(route.distance_m)}</Text><Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>distance</Text></View><View><Text style={[styles.metaValue, { color: theme.colors.text }]}>{route.duration_minutes ? `${route.duration_minutes} min` : '—'}</Text><Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>estimated time</Text></View><View><Text style={[styles.metaValue, { color: theme.colors.text }]}>{route.period ?? '—'}</Text><Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>period</Text></View></View><View style={styles.section}><SectionHeader title="Ordered stops" detail="A route is a sequence of places, not turn-by-turn navigation." />{state === 'loading' ? <AsyncNotice kind="loading" title="Reading route stops" detail="Loading the approved route sequence." /> : null}{state === 'error' ? <AsyncNotice kind="error" title="Stops unavailable" detail={error ?? 'Route stops could not be loaded.'} action="Try again" onAction={() => setRetry((value) => value + 1)} /> : null}<View style={styles.stops}>{stops.map((stop, index) => { const place = stop.place; return <View key={stop.id} style={[styles.stop, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[styles.stopNumber, { backgroundColor: theme.colors.accentSoft }]}><Text style={{ color: theme.colors.accentStrong, fontWeight: '900' }}>{index + 1}</Text></View><View style={{ flex: 1, gap: 3 }}><Text style={[styles.stopName, { color: theme.colors.text }]}>{place?.name ?? stop.name ?? 'Unnamed route stop'}</Text><Text style={[styles.stopDetail, { color: theme.colors.textMuted }]}>{stop.description ?? 'No stop note is recorded.'}{stop.isOptional ? ' · optional' : ''}</Text>{place ? <Pressable accessibilityRole="button" accessibilityLabel={`Open ${place.name}`} onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })}><Text style={[styles.openPlace, { color: theme.colors.accent }]}>Open place detail ›</Text></Pressable> : null}</View></View>; })}</View>{state === 'success' && !stops.length ? <EmptyState icon="⌁" title="No stops recorded" detail="This approved route has no published stop sequence yet." /> : null}</View></ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 42, gap: 17 },
  topBar: { paddingHorizontal: 16, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  hero: { marginHorizontal: 16, borderRadius: 8, padding: 20, gap: 8 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  title: { fontSize: 28, lineHeight: 32, fontWeight: '900' },
  description: { fontSize: 14, lineHeight: 21 },
  meta: { marginHorizontal: 16, borderWidth: 1, borderRadius: 8, padding: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  metaValue: { fontSize: 14, fontWeight: '900' },
  metaLabel: { fontSize: 10, marginTop: 3 },
  section: { paddingHorizontal: 16, gap: 8 },
  stops: { gap: 9 },
  stop: { borderWidth: 1, borderRadius: 8, padding: 12, flexDirection: 'row', gap: 11 },
  stopNumber: { width: 30, height: 30, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  stopName: { fontSize: 15, fontWeight: '800' },
  stopDetail: { fontSize: 12, lineHeight: 17 },
  openPlace: { fontSize: 12, fontWeight: '800', marginTop: 3 },
});
