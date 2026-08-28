import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, ScreenShell, SectionHeader } from '../components/WhilomUI';
import { getMobileDiscoveryRuntime } from '../lib/data-source';
import { getMobileRuntimePolicy } from '../lib/runtime';
import { type MobileTripDetail, useMobileTrips } from '../lib/trip-state';
import { useMobileTheme } from '../theme';

export default function TripDetailScreen({ tripId }: { tripId: string }) {
  const theme = useMobileTheme();
  const { getTrip, updateTrip, createDay, addStop, removeStop, reorderStops, setStopStatus } = useMobileTrips();
  const detail = getTrip(tripId);
  const runtime = useMemo(() => getMobileDiscoveryRuntime(), []);
  const policy = getMobileRuntimePolicy();
  const [name, setName] = useState(detail?.trip.name ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [placeNames, setPlaceNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!detail || runtime.configuration === 'unavailable') return;
    let cancelled = false;
    void Promise.all(detail.stops.map(async (stop) => [stop.placeId, await runtime.source.getPlace(stop.placeId)] as const)).then((entries) => {
      if (!cancelled) setPlaceNames(Object.fromEntries(entries.map(([id, place]) => [id, place?.name ?? id])));
    }).catch(() => { if (!cancelled) setPlaceNames({}); });
    return () => { cancelled = true; };
  }, [detail, runtime]);

  if (!detail) return <ScreenShell><EmptyState icon="✦" title="Trip not found" detail="This trip is not available in the current session." action="Back to Trips" onAction={() => router.replace('/(tabs)/trips')} /></ScreenShell>;

  async function saveName() {
    const result = await updateTrip(tripId, { name });
    setMessage(result.status === 'success' ? 'Trip name saved for this session.' : result.error ?? 'Trip name could not be saved.');
  }

  async function addDay() {
    const result = await createDay({ tripId, dayIndex: detail!.days.length });
    setMessage(result.status === 'success' ? 'Day added.' : result.error ?? 'Day could not be added.');
  }

  async function addPlace() {
    const day = detail!.days[0];
    const result = await addStop({ tripId, tripDayId: day?.id, placeId: 'saltaire', position: detail!.stops.length, plannedMinutes: 60, status: 'planned' });
    setMessage(result.status === 'success' ? 'Saltaire added as a planned stop.' : result.error ?? 'Stop could not be added.');
  }

  async function moveStop(index: number, direction: -1 | 1) {
    const next = detail!.stops[index + direction];
    if (!next) return;
    const ids = detail!.stops.map((stop) => stop.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    const result = await reorderStops(tripId, ids);
    setMessage(result.status === 'success' ? 'Stop order saved for this session.' : result.error ?? 'Stop order could not be saved.');
  }

  async function cycleStatus(stop: MobileTripDetail['stops'][number]) {
    const next = stop.status === 'planned' ? 'completed' : stop.status === 'completed' ? 'skipped' : 'planned';
    const result = await setStopStatus(stop.id, next);
    setMessage(result.status === 'success' ? 'Stop status updated.' : result.error ?? 'Stop status could not be updated.');
  }

  return <ScreenShell><View style={styles.content}><Pressable accessibilityRole="button" accessibilityLabel="Back to Trips" onPress={() => router.back()}><Text style={[styles.back, { color: theme.colors.accent }]}>‹ Trips</Text></Pressable><Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>{detail.trip.name}</Text><Text style={[styles.meta, { color: theme.colors.textMuted }]}>{detail.trip.transport ?? 'No transport set'} · {detail.trip.startDate ?? 'Date to decide'} · session-only planning</Text><View style={[styles.editPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><TextInput accessibilityLabel="Edit trip name" value={name} onChangeText={setName} style={[styles.nameInput, { color: theme.colors.text, borderColor: theme.colors.border }]} /><Pressable accessibilityRole="button" accessibilityLabel="Save trip name" onPress={() => void saveName()} style={[styles.smallButton, { borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.accent }}>Save name</Text></Pressable></View>{message ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: theme.colors.accentStrong }]}>{message}</Text> : null}<SectionHeader title="Days and stops" detail={`${detail.stops.length} stop${detail.stops.length === 1 ? '' : 's'} · ${detail.days.length} day${detail.days.length === 1 ? '' : 's'}`} /><View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="Add a trip day" onPress={() => void addDay()} style={[styles.smallButton, { borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.accent }}>＋ Add day</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Add Saltaire to trip" onPress={() => void addPlace()} style={[styles.smallButton, { borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.accent }}>＋ Add place</Text></Pressable></View>{detail.days.map((day) => <View key={day.id} style={[styles.day, { borderColor: theme.colors.border }]}><Text style={[styles.dayTitle, { color: theme.colors.text }]}>Day {day.dayIndex + 1}{day.date ? ` · ${day.date}` : ''}</Text>{detail.stops.filter((stop) => stop.tripDayId === day.id).map((stop) => { const index = detail.stops.findIndex((item) => item.id === stop.id); return <View key={stop.id} style={[styles.stop, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={{ flex: 1 }}><Pressable accessibilityRole="button" accessibilityLabel={`Open place ${placeNames[stop.placeId] ?? stop.placeId}`} onPress={() => router.push({ pathname: '/place/[id]', params: { id: stop.placeId } })}><Text style={[styles.stopName, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>{placeNames[stop.placeId] ?? 'Reading place…'}</Text></Pressable><Text style={[styles.stopMeta, { color: theme.colors.textMuted }]}>{stop.plannedMinutes ? `${stop.plannedMinutes} min` : 'Time not set'} · {stop.status}</Text></View><View style={styles.stopActions}><Pressable accessibilityRole="button" accessibilityLabel={`Mark ${placeNames[stop.placeId] ?? 'stop'} ${stop.status === 'planned' ? 'completed' : 'planned'}`} onPress={() => void cycleStatus(stop)} style={styles.iconButton}><Text style={{ color: theme.colors.accent }}>✓</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Move stop earlier" disabled={index === 0} onPress={() => void moveStop(index, -1)} style={[styles.iconButton, { opacity: index === 0 ? 0.35 : 1 }]}><Text style={{ color: theme.colors.accent }}>↑</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Move stop later" disabled={index === detail.stops.length - 1} onPress={() => void moveStop(index, 1)} style={[styles.iconButton, { opacity: index === detail.stops.length - 1 ? 0.35 : 1 }]}><Text style={{ color: theme.colors.accent }}>↓</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${placeNames[stop.placeId] ?? 'stop'} from trip`} onPress={() => void removeStop(stop.id)} style={styles.iconButton}><Text style={{ color: theme.colors.danger }}>×</Text></Pressable></View></View>; })}</View>)}{!detail.days.length ? <EmptyState icon="＋" title="Add your first day" detail="A day keeps the order of places clear without pretending to calculate a route." action="Add day" onAction={() => void addDay()} /> : null}<View style={[styles.note, { backgroundColor: theme.colors.surfaceMuted }]}><Text style={[styles.noteTitle, { color: theme.colors.accentStrong }]}>TRIP BEHAVIOUR FOUNDATION</Text><Text style={[styles.noteText, { color: theme.colors.textMuted }]}>{policy.fixtureAllowed ? 'This development trip is ephemeral and resets with the app session.' : 'Live trip writes are disabled in this release-safe phase; no network mutation was attempted.'}</Text></View></View></ScreenShell>;
}

const styles = StyleSheet.create({
  content: { padding: 18, gap: 16 },
  back: { fontSize: 14, fontWeight: '800' },
  title: { fontSize: 30, lineHeight: 35, fontWeight: '800' },
  meta: { fontSize: 12, lineHeight: 18 },
  message: { fontSize: 12, lineHeight: 18 },
  editPanel: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 9 },
  nameInput: { borderBottomWidth: 1, minHeight: 42, fontSize: 16 },
  smallButton: { minHeight: 40, borderWidth: 1, borderRadius: 4, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  day: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 9 },
  dayTitle: { fontWeight: '900', fontSize: 13 },
  stop: { borderWidth: 1, borderRadius: 8, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' },
  stopName: { fontSize: 16, lineHeight: 20, fontWeight: '800' },
  stopMeta: { fontSize: 11, marginTop: 3, textTransform: 'capitalize' },
  stopActions: { flexDirection: 'row', gap: 2 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  note: { padding: 13, gap: 4 },
  noteTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  noteText: { fontSize: 12, lineHeight: 18 },
});
