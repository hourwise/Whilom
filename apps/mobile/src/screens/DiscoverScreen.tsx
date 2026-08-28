import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  DEFAULT_STATE,
  coverageMessage,
  stateFromParams,
  type Coverage,
  type DiscoveryPlace,
  type DiscoveryState,
  type MapBounds,
  type MapCluster,
  type MapPlace,
  type PeriodCount,
  type SearchResult,
} from '@whilom/discovery';
import { DiscoveryMap, markersForPlaces } from '../components/DiscoveryMap';
import {
  AsyncNotice,
  BrandMark,
  CoverageNotice,
  EmptyState,
  MapKey,
  PlaceCard,
  SearchField,
  SearchResultCard,
  ScreenShell,
  SectionHeader,
  TimeRuler,
} from '../components/WhilomUI';
import { getMobileDiscoveryRuntime, discoveryPlaceFromMapPlace } from '../lib/data-source';
import { useMobileBehaviour } from '../lib/behaviour';
import { useMobileSession } from '../lib/session';
import type { CoverageMode } from '../lib/fixtures';
import type { MobileTimeMode } from '../lib/periods';
import { DISPLAY_CATEGORIES, type DisplayCategoryId } from '../lib/taxonomy';
import { useMobileTheme } from '../theme';

const LOCATION_OPTIONS: ReadonlyArray<{ id: CoverageMode; label: string; detail: string }> = [
  { id: 'nearby', label: 'Current view', detail: 'A bounded discovery window' },
  { id: 'uk', label: 'Wider view', detail: 'Coverage may be partial' },
  { id: 'outside', label: 'Try elsewhere', detail: 'A truthful no-coverage state' },
];

function boundsForMode(mode: CoverageMode): MapBounds {
  if (mode === 'outside') return { swLng: 0.4, swLat: 52, neLng: 1.9, neLat: 53.2 };
  if (mode === 'uk') return { swLng: -3, swLat: 53.3, neLng: -0.5, neLat: 54.8 };
  return { swLng: -2.3, swLat: 53.55, neLng: -0.45, neLat: 54.75 };
}

function viewportForMode(mode: CoverageMode) {
  if (mode === 'outside') return { latitude: 52.55, longitude: 1.1, latitudeDelta: 1.1, longitudeDelta: 1.3 };
  if (mode === 'uk') return { latitude: 54.05, longitude: -1.65, latitudeDelta: 1.4, longitudeDelta: 2.2 };
  return { latitude: 54.05, longitude: -1.35, latitudeDelta: 1.2, longitudeDelta: 1.7 };
}

type AsyncState = 'idle' | 'loading' | 'success' | 'error';

type DiscoveryRouteParams = {
  q?: string | string[];
  period?: string | string[];
  timeMode?: string | string[];
  cat?: string | string[];
  place?: string | string[];
};

function firstRouteValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function stateFromRouteParams(routeParams: DiscoveryRouteParams): DiscoveryState {
  const params = new URLSearchParams();
  for (const key of ['q', 'period', 'timeMode', 'cat', 'place'] as const) {
    const value = firstRouteValue(routeParams[key]);
    if (value) params.set(key, value);
  }
  return stateFromParams(params);
}

function placeWithState(place: DiscoveryPlace, isSaved: (id: string, fallback?: boolean) => boolean, isVisited: (id: string, fallback?: boolean) => boolean): DiscoveryPlace {
  return { ...place, saved: isSaved(place.id, place.saved), visited: isVisited(place.id, place.visited) };
}

export default function DiscoverScreen() {
  const theme = useMobileTheme();
  const runtime = useMemo(() => getMobileDiscoveryRuntime(), []);
  const routeParams = useLocalSearchParams<DiscoveryRouteParams>();
  const [initialRouteState] = useState(() => stateFromRouteParams(routeParams));
  const { state: session } = useMobileSession();
  const { isSaved, isVisited, isSaving, toggleSaved } = useMobileBehaviour();
  const [query, setQuery] = useState(initialRouteState.q);
  const [locationMode, setLocationMode] = useState<CoverageMode>('nearby');
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(initialRouteState.periodId);
  const [timeMode, setTimeMode] = useState<MobileTimeMode>(initialRouteState.timeMode);
  const initialCategory = initialRouteState.categories[0];
  const [activeCategory, setActiveCategory] = useState<DisplayCategoryId | null>(() => DISPLAY_CATEGORIES.some((category) => category.id === initialCategory) ? initialCategory as DisplayCategoryId : null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(initialRouteState.selected);
  const [mapPlaces, setMapPlaces] = useState<MapPlace[]>([]);
  const [clusters, setClusters] = useState<MapCluster[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [periodCounts, setPeriodCounts] = useState<PeriodCount[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<DiscoveryPlace | null>(null);
  const [dataState, setDataState] = useState<AsyncState>('idle');
  const [searchState, setSearchState] = useState<AsyncState>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [searchReloadToken, setSearchReloadToken] = useState(0);

  const discoveryState = useMemo<DiscoveryState>(() => ({
    ...DEFAULT_STATE,
    q: query,
    periodId: selectedPeriod,
    timeMode,
    categories: activeCategory ? [activeCategory] : [],
  }), [activeCategory, query, selectedPeriod, timeMode]);
  const bounds = useMemo(() => boundsForMode(locationMode), [locationMode]);

  useEffect(() => {
    router.setParams({
      q: query.trim() || undefined,
      period: selectedPeriod || undefined,
      timeMode: timeMode === 'all' ? undefined : timeMode,
      cat: activeCategory || undefined,
      place: selectedPlaceId || undefined,
    });
  }, [activeCategory, query, selectedPeriod, selectedPlaceId, timeMode]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (runtime.configuration === 'unavailable') {
        setDataState('error');
        setError('Live mode is selected, but the public Supabase URL and anon key are not configured. No network request was made.');
        return;
      }
      setDataState('loading');
      setError(null);
      void Promise.all([
        runtime.source.getMapPlaces({ bounds, state: discoveryState }),
        runtime.source.getMapClusters({ bounds, state: discoveryState }),
        runtime.source.getCoverage(bounds),
        runtime.source.getPeriodCounts(bounds, discoveryState),
      ]).then(([places, nextClusters, nextCoverage, counts]) => {
        if (cancelled) return;
        setMapPlaces(places);
        setClusters(nextClusters);
        setCoverage(nextCoverage);
        setPeriodCounts(counts);
        setDataState('success');
      }).catch((cause: unknown) => {
        if (cancelled) return;
        setDataState('error');
        setError(cause instanceof Error ? cause.message : 'Whilom could not load this discovery window.');
      });
    }, query.trim() ? 180 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [bounds, discoveryState, query, reloadToken, runtime]);

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) {
      setSearchResults([]);
      setSearchState('idle');
      setSearchError(null);
      return () => { cancelled = true; };
    }
    if (runtime.configuration === 'unavailable') {
      setSearchResults([]);
      setSearchState('error');
      setSearchError('Live mode is selected, but public Supabase configuration is unavailable. No network request was made.');
      return () => { cancelled = true; };
    }
    setSearchState('loading');
    setSearchError(null);
    void runtime.source.searchDiscovery(query, 12).then((results) => {
      if (cancelled) return;
      setSearchResults(results);
      setSearchState('success');
    }).catch((cause: unknown) => {
      if (cancelled) return;
      setSearchResults([]);
      setSearchState('error');
      setSearchError(cause instanceof Error ? cause.message : 'Whilom could not search this discovery window.');
    });
    return () => { cancelled = true; };
  }, [query, runtime, searchReloadToken]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedPlaceId) {
      setSelectedPlace(null);
      return () => { cancelled = true; };
    }
    const mapRow = mapPlaces.find((place) => place.id === selectedPlaceId);
    setSelectedPlace(mapRow ? discoveryPlaceFromMapPlace(mapRow) : null);
    void runtime.source.getPlace(selectedPlaceId).then((place) => {
      if (!cancelled && place) setSelectedPlace(place);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [mapPlaces, runtime, selectedPlaceId]);

  const selectedCoverage = coverageMessage(coverage);
  const mapCoverage = selectedCoverage?.level === 'none' ? 'outside' : selectedCoverage?.level ?? 'full';
  const mapCards = mapPlaces.map(discoveryPlaceFromMapPlace);
  const placeSearchResults = searchResults.filter((result) => result.kind === 'place');
  const personSearchResults = searchResults.filter((result) => result.kind === 'person');
  const detailPlace = selectedPlace ? placeWithState(selectedPlace, isSaved, isVisited) : null;
  const modeLabel = runtime.configuration === 'unavailable' ? 'LIVE READ · NOT CONFIGURED' : runtime.mode === 'live' ? 'LIVE READ MODE' : 'DEVELOPMENT FIXTURES';

  function openPlace(id: string) {
    setSelectedPlaceId(id);
    router.push({ pathname: '/place/[id]', params: { id } });
  }

  return (
    <ScreenShell>
      <View style={[screenStyles.header, { borderBottomColor: theme.colors.border }]}>
        <BrandMark />
        <View style={screenStyles.headerActions}><Text style={[screenStyles.liveLabel, { color: theme.colors.textFaint }]}>{modeLabel}</Text><View style={[screenStyles.avatar, { backgroundColor: theme.colors.accentSoft }]}><Text style={[screenStyles.avatarText, { color: theme.colors.accentStrong }]}>F</Text></View></View>
      </View>
      <View style={screenStyles.content}>
        <View style={screenStyles.intro}><Text style={[screenStyles.kicker, { color: theme.colors.accent }]}>WHERE · WHEN · WHO · WHAT</Text><Text style={[screenStyles.title, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>Find the history in view.</Text><Text style={[screenStyles.subtitle, { color: theme.colors.textMuted }]}>A map for discovery, with the source trail kept close.</Text></View>
        <SearchField value={query} onChangeText={setQuery} />
        <View style={screenStyles.locationRow}>{LOCATION_OPTIONS.map((option) => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`${option.label}: ${option.detail}`} accessibilityState={{ selected: locationMode === option.id }} onPress={() => { setLocationMode(option.id); setSelectedPlaceId(null); }} style={[screenStyles.locationControl, { backgroundColor: locationMode === option.id ? theme.colors.accent : theme.colors.surface, borderColor: locationMode === option.id ? theme.colors.accent : theme.colors.border }]}><Text style={[screenStyles.locationLabel, { color: locationMode === option.id ? theme.colors.white : theme.colors.text }]}>{option.label}</Text></Pressable>)}</View>
        <Text style={[screenStyles.locationDetail, { color: theme.colors.textFaint }]}>{LOCATION_OPTIONS.find((option) => option.id === locationMode)?.detail}</Text>
        {selectedCoverage ? <CoverageNotice level={selectedCoverage.level} text={selectedCoverage.text} /> : null}
        {runtime.configuration === 'unavailable' ? <EmptyState icon="⚙" title="Live read mode needs public configuration" detail={error ?? 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then opt into live mode. Fixture mode remains the safe default.'} /> : null}
        {dataState === 'error' && runtime.configuration === 'available' ? <AsyncNotice kind="error" title="Could not load this view" detail={error ?? 'Whilom could not load this discovery window.'} action="Try again" onAction={() => setReloadToken((current) => current + 1)} /> : null}
        <View style={[screenStyles.mapCard, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}><View style={screenStyles.mapTitleRow}><View><Text style={[screenStyles.mapTitle, { color: theme.colors.text }]}>Around your view</Text><Text style={[screenStyles.mapDetail, { color: theme.colors.textMuted }]}>{dataState === 'loading' ? 'Reading bounded discovery data…' : `${mapPlaces.length} places · ${periodCounts.length} period${periodCounts.length === 1 ? '' : 's'} represented`}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Center on current view" onPress={() => setLocationMode('nearby')} style={[screenStyles.centerButton, { backgroundColor: theme.colors.accentSoft }]}><Text style={[screenStyles.centerGlyph, { color: theme.colors.accentStrong }]}>⌖</Text></Pressable></View><DiscoveryMap viewport={viewportForMode(locationMode)} markers={markersForPlaces(mapPlaces, selectedPlaceId)} clusters={clusters} selectedPlaceId={selectedPlaceId} coverageState={mapCoverage} onMarkerPress={(marker) => setSelectedPlaceId(marker.id)} /><Text style={[screenStyles.mapFootnote, { color: theme.colors.textFaint }]}>Bounded map contract · clusters are available at broad zoom.</Text></View>
        {detailPlace ? <View style={screenStyles.previewSection}><SectionHeader title="Place preview" detail="Overview first; depth lives on the place page" /><PlaceCard place={detailPlace} compact saved={isSaved(detailPlace.id, detailPlace.saved)} saveBusy={isSaving(detailPlace.id)} onSave={() => { if (session.status === 'signed_in') void toggleSaved(detailPlace.id, detailPlace.saved); else router.push('/auth/sign-in'); }} onPress={() => openPlace(detailPlace.id)} /></View> : null}
        <View style={screenStyles.sectionBlock}><TimeRuler mode={timeMode} selectedPeriod={selectedPeriod} onModeChange={setTimeMode} onPeriodChange={setSelectedPeriod} /></View>
        <View style={screenStyles.sectionBlock}><MapKey activeCategory={activeCategory} onToggle={(category) => setActiveCategory(activeCategory === category ? null : category)} /></View>
        {query.trim() ? <View style={screenStyles.sectionBlock}><SectionHeader title="Search results" detail={searchState === 'loading' ? 'Searching the shared place/person contract…' : `${searchResults.length} result${searchResults.length === 1 ? '' : 's'} · places and people in one field`} />{searchState === 'error' ? <AsyncNotice kind="error" title="Search unavailable" detail={searchError ?? 'Whilom could not search this discovery window.'} action="Try again" onAction={() => setSearchReloadToken((current) => current + 1)} /> : null}<Text style={[screenStyles.subheading, { color: theme.colors.textMuted }]}>Places</Text><View style={screenStyles.cardStack}>{placeSearchResults.map((result) => <SearchResultCard key={result.id} result={result} onPress={() => openPlace(result.id)} />)}</View><Text style={[screenStyles.subheading, { color: theme.colors.textMuted }]}>People</Text><View style={screenStyles.cardStack}>{personSearchResults.map((result) => <SearchResultCard key={result.id} result={result} onPress={() => router.push({ pathname: '/person/[id]', params: { id: result.id } })} />)}</View>{searchState === 'success' && !searchResults.length ? <EmptyState icon="⌕" title={`Nothing matching “${query}”`} detail="Try a different place, person, or spelling. An empty result means Whilom has no matching record here — not that the location has no history." /> : null}</View> : <View style={screenStyles.sectionBlock}><SectionHeader title="Nearby places" detail={dataState === 'loading' ? 'Loading the bounded result set…' : 'Tap a marker or card to go deeper'} /><View style={screenStyles.cardStack}>{mapCards.slice(0, 4).map((place) => <PlaceCard key={place.id} place={placeWithState(place, isSaved, isVisited)} saved={isSaved(place.id, place.saved)} saveBusy={isSaving(place.id)} onSave={() => { if (session.status === 'signed_in') void toggleSaved(place.id, place.saved); else router.push('/auth/sign-in'); }} onPress={() => openPlace(place.id)} />)}{dataState === 'success' && !mapCards.length ? <EmptyState icon="◌" title="Nothing in Whilom here yet" detail="This area may have plenty of history. Whilom has not activated detailed coverage or has no matching record for these filters." action="Show covered view" onAction={() => { setLocationMode('nearby'); setSelectedPeriod(null); setActiveCategory(null); }} /> : null}</View></View>}
      </View>
    </ScreenShell>
  );
}

const screenStyles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  headerActions: { alignItems: 'flex-end', gap: 6 },
  liveLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.55 },
  avatar: { width: 32, height: 32, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 14 },
  intro: { gap: 5 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  locationRow: { flexDirection: 'row', gap: 7 },
  locationControl: { minHeight: 40, borderWidth: 1, borderRadius: 4, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', flex: 1, minWidth: 0 },
  locationLabel: { fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  locationDetail: { fontSize: 11, marginTop: -8 },
  mapCard: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 10 },
  mapTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  mapTitle: { fontSize: 18, fontWeight: '800' },
  mapDetail: { fontSize: 11, marginTop: 2 },
  centerButton: { width: 34, height: 34, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  centerGlyph: { fontSize: 20 },
  mapFootnote: { fontSize: 10, lineHeight: 15 },
  previewSection: { gap: 7 },
  sectionBlock: { gap: 5 },
  subheading: { fontSize: 11, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 3 },
  cardStack: { gap: 9 },
});
