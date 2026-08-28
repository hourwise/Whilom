import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '../../src/components/WhilomUI';
import { getMobileDiscoveryRuntime } from '../../src/lib/data-source';
import PlaceDetailScreen from '../../src/screens/PlaceDetailScreen';
import { useMobileTheme } from '../../src/theme';

export default function PlaceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useMobileTheme();
  const runtime = useMemo(() => getMobileDiscoveryRuntime(), []);
  const [place, setPlace] = useState<Awaited<ReturnType<typeof runtime.source.getPlace>>>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    if (!id || runtime.configuration === 'unavailable') { setLoading(false); return () => { cancelled = true; }; }
    void runtime.source.getPlace(id).then((nextPlace) => { if (!cancelled) { setPlace(nextPlace); setLoading(false); } }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, runtime]);
  if (loading) return <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', padding: 24 }}><Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>Reading place record…</Text></View>;
  if (runtime.configuration === 'unavailable') return <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', padding: 20 }}><EmptyState icon="⚙" title="Live read mode is not configured" detail="No network request was made. Select fixture mode or provide the public Supabase URL and anon key." /></View>;
  if (!place) return <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', padding: 20 }}><EmptyState icon="⌖" title="Place not found" detail="This link does not resolve to a published Whilom place record." /></View>;
  return <PlaceDetailScreen place={place} source={runtime.source} />;
}
