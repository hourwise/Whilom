import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { DiscoveryMap, markersForPlaces } from '../components/DiscoveryMap';
import {
  BrandMark,
  CoverageNotice,
  EmptyState,
  MapKey,
  PersonCard,
  Pill,
  PlaceCard,
  SearchField,
  ScreenShell,
  SectionHeader,
  TimeRuler,
} from '../components/WhilomUI';
import { developmentDataSource, placesForCoverage, type CoverageMode, type DemoPlace } from '../lib/fixtures';
import { type MobileTimeMode } from '../lib/periods';
import type { DisplayCategoryId } from '../lib/taxonomy';
import { useMobileTheme } from '../theme';

const LOCATION_OPTIONS: ReadonlyArray<{ id: CoverageMode; label: string; detail: string }> = [
  { id: 'nearby', label: 'Near me', detail: 'Yorkshire detail' },
  { id: 'uk', label: 'UK-wide', detail: 'Partial coverage' },
  { id: 'outside', label: 'Outside coverage', detail: 'Not mapped yet' },
];

function coverageForMode(mode: CoverageMode): { level: 'full' | 'partial' | 'none'; text: string } {
  if (mode === 'nearby') return { level: 'full', text: '' };
  if (mode === 'uk') return { level: 'partial', text: "Part of this view is outside Whilom's detailed coverage (currently Yorkshire). Heritage beyond it has not been mapped yet." };
  return { level: 'none', text: 'Whilom has not activated detailed coverage here yet — this area has plenty of history, we just have not mapped it.' };
}

export default function DiscoverScreen() {
  const theme = useMobileTheme();
  const [query, setQuery] = useState('');
  const [locationMode, setLocationMode] = useState<CoverageMode>('nearby');
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [timeMode, setTimeMode] = useState<MobileTimeMode>('all');
  const [activeCategory, setActiveCategory] = useState<DisplayCategoryId | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState(() => new Set(developmentDataSource.places.filter((place) => place.saved).map((place) => place.id)));

  const searchResults = useMemo(() => developmentDataSource.search(query), [query]);
  const visiblePlaces = useMemo(() => {
    const candidates = placesForCoverage(locationMode);
    return candidates.filter((place) => {
      const periodMatches = !selectedPeriod || place.periodIds.includes(selectedPeriod);
      const categoryMatches = !activeCategory || place.category === activeCategory;
      const searchMatches = !query.trim() || place.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
      return periodMatches && categoryMatches && searchMatches;
    });
  }, [activeCategory, locationMode, query, selectedPeriod]);

  const selectedPlace = selectedPlaceId ? developmentDataSource.placeById(selectedPlaceId) : undefined;
  const coverage = coverageForMode(locationMode);
  const placesForMap = visiblePlaces.length ? visiblePlaces : locationMode === 'outside' ? [] : placesForCoverage(locationMode);
  const placeSearchResults = searchResults.filter((result) => result.kind === 'place');
  const personSearchResults = searchResults.filter((result) => result.kind === 'person');

  function toggleSaved(place: DemoPlace) {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(place.id)) next.delete(place.id);
      else next.add(place.id);
      return next;
    });
  }

  function placeWithLocalState(place: DemoPlace): DemoPlace {
    return { ...place, saved: savedIds.has(place.id) };
  }

  return (
    <ScreenShell>
      <View style={[screenStyles.header, { borderBottomColor: theme.colors.border }]}>
        <BrandMark />
        <View style={screenStyles.headerActions}>
          <Text style={[screenStyles.liveLabel, { color: theme.colors.textFaint }]}>FIELD MODE</Text>
          <View style={[screenStyles.avatar, { backgroundColor: theme.colors.accentSoft }]}><Text style={[screenStyles.avatarText, { color: theme.colors.accentStrong }]}>F</Text></View>
        </View>
      </View>

      <View style={screenStyles.content}>
        <View style={screenStyles.intro}>
          <Text style={[screenStyles.kicker, { color: theme.colors.accent }]}>DISCOVER THE LAYERS AROUND YOU</Text>
          <Text style={[screenStyles.title, { color: theme.colors.text }]}>Find the history in view.</Text>
          <Text style={[screenStyles.subtitle, { color: theme.colors.textMuted }]}>Start with where you are, then ask when, who or what shaped the place.</Text>
        </View>

        <SearchField value={query} onChangeText={setQuery} />

        <View style={screenStyles.locationRow}>
          {LOCATION_OPTIONS.map((option) => <Pill key={option.id} label={option.label} icon={option.id === 'nearby' ? '⌖' : option.id === 'uk' ? '⌂' : '◌'} selected={locationMode === option.id} onPress={() => { setLocationMode(option.id); setSelectedPlaceId(null); }} />)}
        </View>
        <Text style={[screenStyles.locationDetail, { color: theme.colors.textFaint }]}>{LOCATION_OPTIONS.find((option) => option.id === locationMode)?.detail}</Text>

        <CoverageNotice level={coverage.level} text={coverage.text} />

        <View style={[screenStyles.mapCard, { backgroundColor: theme.colors.surfaceRaised }]}>
          <View style={screenStyles.mapTitleRow}>
            <View>
              <Text style={[screenStyles.mapTitle, { color: theme.colors.text }]}>Around your view</Text>
              <Text style={[screenStyles.mapDetail, { color: theme.colors.textMuted }]}>{visiblePlaces.length || placesForMap.length} places in the development set</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Center on current area" onPress={() => setLocationMode('nearby')} style={[screenStyles.centerButton, { backgroundColor: theme.colors.accentSoft }]}><Text style={[screenStyles.centerGlyph, { color: theme.colors.accentStrong }]}>⌖</Text></Pressable>
          </View>
          <DiscoveryMap
            viewport={{ latitude: 53.96, longitude: -1.08, latitudeDelta: 1.4, longitudeDelta: 1.7 }}
            markers={markersForPlaces(placesForMap, selectedPlaceId)}
            selectedPlaceId={selectedPlaceId}
            coverageState={coverage.level === 'none' ? 'outside' : coverage.level}
            onMarkerPress={(marker) => setSelectedPlaceId(marker.id)}
          />
          <Text style={[screenStyles.mapFootnote, { color: theme.colors.textFaint }]}>Map preview · a native map implementation will plug into the same boundary.</Text>
        </View>

        {selectedPlace ? (
          <View style={screenStyles.previewSection}>
            <SectionHeader title="Place preview" detail="Overview first; depth lives on the place page" />
            <PlaceCard place={placeWithLocalState(selectedPlace)} compact onSave={() => toggleSaved(selectedPlace)} onPress={() => router.push({ pathname: '/place/[id]', params: { id: selectedPlace.id } })} />
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/place/[id]', params: { id: selectedPlace.id } })} style={[screenStyles.detailButton, { borderColor: theme.colors.accent }]}><Text style={[screenStyles.detailButtonText, { color: theme.colors.accent }]}>Open full place detail  ›</Text></Pressable>
          </View>
        ) : null}

        <View style={screenStyles.sectionBlock}>
          <TimeRuler mode={timeMode} selectedPeriod={selectedPeriod} onModeChange={setTimeMode} onPeriodChange={setSelectedPeriod} />
        </View>

        <View style={screenStyles.sectionBlock}>
          <MapKey activeCategory={activeCategory} onToggle={(category) => setActiveCategory(activeCategory === category ? null : category)} />
        </View>

        {query.trim() ? (
          <View style={screenStyles.sectionBlock}>
            <SectionHeader title="Search results" detail={`${searchResults.length} result${searchResults.length === 1 ? '' : 's'} · places and people in one field`} />
            {placeSearchResults.length ? <Text style={[screenStyles.subheading, { color: theme.colors.textMuted }]}>Places</Text> : null}
            <View style={screenStyles.cardStack}>{placeSearchResults.map((result) => <PlaceCard key={result.item.id} place={placeWithLocalState(result.item)} compact onSave={() => toggleSaved(result.item)} onPress={() => router.push({ pathname: '/place/[id]', params: { id: result.item.id } })} />)}</View>
            {personSearchResults.length ? <Text style={[screenStyles.subheading, { color: theme.colors.textMuted }]}>People</Text> : null}
            <View style={screenStyles.cardStack}>{personSearchResults.map((result) => <PersonCard key={result.item.id} person={result.item} onPress={() => router.push({ pathname: '/person/[id]', params: { id: result.item.id } })} />)}</View>
            {!searchResults.length ? <EmptyState icon="⌕" title={`Nothing matching “${query}”`} detail="Try a different place, person, or spelling. An empty result means Whilom has no matching record here — not that the location has no history." /> : null}
          </View>
        ) : (
          <View style={screenStyles.sectionBlock}>
            <SectionHeader title="Nearby places" detail="Tap a marker or card to go deeper" />
            <View style={screenStyles.cardStack}>
              {visiblePlaces.slice(0, 4).map((place) => <PlaceCard key={place.id} place={placeWithLocalState(place)} onSave={() => toggleSaved(place)} onPress={() => { setSelectedPlaceId(place.id); router.push({ pathname: '/place/[id]', params: { id: place.id } }); }} />)}
              {!visiblePlaces.length ? <EmptyState icon="◌" title="Nothing in Whilom here yet" detail="This area may have plenty of history. Whilom has not activated detailed coverage or has no matching record for these filters." action="Show covered area" onAction={() => { setLocationMode('nearby'); setSelectedPeriod(null); setActiveCategory(null); }} /> : null}
            </View>
          </View>
        )}
      </View>
    </ScreenShell>
  );
}

const screenStyles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  headerActions: { alignItems: 'flex-end', gap: 6 },
  liveLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  content: { paddingHorizontal: 18, paddingTop: 20, gap: 14 },
  intro: { gap: 5, paddingBottom: 2 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { fontSize: 29, lineHeight: 33, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 14, lineHeight: 20, maxWidth: 340 },
  locationRow: { flexDirection: 'row', gap: 8 },
  locationDetail: { fontSize: 11, marginTop: -8 },
  mapCard: { borderRadius: 20, padding: 12, gap: 10 },
  mapTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  mapTitle: { fontSize: 17, fontWeight: '800' },
  mapDetail: { fontSize: 11, marginTop: 2 },
  centerButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  centerGlyph: { fontSize: 21 },
  mapFootnote: { fontSize: 10, lineHeight: 15 },
  previewSection: { gap: 8 },
  detailButton: { borderWidth: 1, borderRadius: 11, paddingVertical: 11, alignItems: 'center' },
  detailButtonText: { fontSize: 13, fontWeight: '800' },
  sectionBlock: { gap: 5 },
  subheading: { fontSize: 12, fontWeight: '800', marginTop: 3 },
  cardStack: { gap: 9 },
});
