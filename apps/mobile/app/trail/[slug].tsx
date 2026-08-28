import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '../../src/components/WhilomUI';
import { getMobileRouteRuntime } from '../../src/lib/route-source';
import RouteDetailScreen from '../../src/screens/RouteDetailScreen';
import { useMobileTheme } from '../../src/theme';

export default function TrailRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const theme = useMobileTheme();
  const runtime = useMemo(() => getMobileRouteRuntime(), []);
  const [route, setRoute] = useState<Awaited<ReturnType<typeof runtime.source.getRoute>>>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!slug || runtime.configuration === 'unavailable') { setLoading(false); return () => { cancelled = true; }; }
    void runtime.source.getRoute(slug).then((next) => { if (!cancelled) { setRoute(next); setLoading(false); } }).catch(() => { if (!cancelled) { setFailed(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [runtime, slug]);
  if (loading) return <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', padding: 24 }}><Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>Reading route…</Text></View>;
  if (runtime.configuration === 'unavailable' || failed) return <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', padding: 20 }}><EmptyState icon="⌁" title="Route unavailable" detail={runtime.configuration === 'unavailable' ? 'Live route reads are not configured. No network request was made.' : 'This route could not be read right now.'} /></View>;
  if (!route) return <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', padding: 20 }}><EmptyState icon="⌁" title="Route not found" detail="This route is not currently an approved Whilom route." /></View>;
  return <RouteDetailScreen route={route} source={runtime.source} />;
}
