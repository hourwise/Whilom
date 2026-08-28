import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  displayCategory,
  relationshipLabel,
  type DiscoveryDataSource,
  type DiscoveryPerson,
  type DiscoveryPlace,
} from '@whilom/discovery';
import { AsyncNotice, BrandMark, IconGlyph, InfoRow, PlaceCard, SaveButton, SectionHeader, styles as uiStyles } from '../components/WhilomUI';
import { useEphemeralPlaceState } from '../lib/ephemeral-state';
import { MOBILE_PERIODS } from '../lib/periods';
import { useMobileTheme } from '../theme';

export default function PlaceDetailScreen({ place, source }: { place: DiscoveryPlace; source: DiscoveryDataSource }) {
  const theme = useMobileTheme();
  const category = displayCategory(place.category);
  const { isSaved, isVisited, toggleSaved, toggleVisited } = useEphemeralPlaceState();
  const [people, setPeople] = useState<DiscoveryPerson[]>([]);
  const [relatedPlaces, setRelatedPlaces] = useState<DiscoveryPlace[]>([]);
  const [relatedState, setRelatedState] = useState<'loading' | 'success' | 'error'>('loading');
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setRelatedState('loading');
    setRelatedError(null);
    void Promise.all([
      Promise.all(place.people.map((id) => source.getPerson(id))),
      Promise.all(place.relatedPlaces.map((id) => source.getPlace(id))),
    ]).then(([personResults, placeResults]) => {
      if (cancelled) return;
      setPeople(personResults.filter((person): person is DiscoveryPerson => Boolean(person)));
      setRelatedPlaces(placeResults.filter((related): related is DiscoveryPlace => Boolean(related)));
      setRelatedState('success');
    }).catch((cause: unknown) => {
      if (cancelled) return;
      setRelatedState('error');
      setRelatedError(cause instanceof Error ? cause.message : 'Whilom could not load this place’s connected records.');
    });
    return () => { cancelled = true; };
  }, [place.people, place.relatedPlaces, reloadToken, source]);

  const saved = isSaved(place.id, place.saved);
  const visited = isVisited(place.id, place.visited);
  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={detailStyles.content}>
      <View style={detailStyles.topBar}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[detailStyles.backButton, { width: theme.controls.touchTarget, height: theme.controls.touchTarget, backgroundColor: theme.colors.surface }]}><Text style={[detailStyles.backGlyph, { color: theme.colors.text }]}>‹</Text></Pressable><BrandMark eyebrow="PLACE DETAIL" /><View style={{ width: theme.controls.touchTarget }} /></View>
      <View style={[detailStyles.hero, { backgroundColor: category.colour }]}><View style={[detailStyles.heroTexture, { borderColor: `${theme.colors.white}30` }]} /><View style={[detailStyles.heroIcon, { backgroundColor: `${theme.colors.text}25` }]}><IconGlyph symbol={category.symbol} colour={theme.colors.white} size={32} /></View><Text style={[detailStyles.heroCategory, { color: `${theme.colors.white}d9` }]}>{category.label.toUpperCase()}  ·  {place.placeType.replace(/_/g, ' ')}</Text><Text style={[detailStyles.heroTitle, { color: theme.colors.white, fontFamily: theme.typography.editorial }]}>{place.name}</Text><Text style={[detailStyles.heroLocation, { color: `${theme.colors.white}d9` }]}>{place.location.label}</Text></View>
      <View style={detailStyles.actionRow}><SaveButton saved={saved} onPress={() => toggleSaved(place.id, place.saved)} /><Pressable accessibilityRole="button" accessibilityLabel={visited ? 'Remove visited mark' : 'Mark place as visited'} accessibilityState={{ selected: visited }} onPress={() => toggleVisited(place.id, place.visited)} style={[detailStyles.actionButton, { minHeight: theme.controls.touchTarget, backgroundColor: visited ? theme.colors.accentSoft : theme.colors.surface, borderColor: visited ? theme.colors.accent : theme.colors.border }]}><Text style={[detailStyles.actionText, { color: visited ? theme.colors.accentStrong : theme.colors.text }]}>{visited ? 'Visited ✓' : 'Mark visited'}</Text></Pressable><Pressable accessibilityRole="link" accessibilityLabel="Directions are available in a later release" accessibilityState={{ disabled: true }} disabled style={[detailStyles.actionButton, { minHeight: theme.controls.touchTarget, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: 0.65 }]}><Text style={[detailStyles.actionText, { color: theme.colors.text }]}>Directions ↗</Text></Pressable></View>
      <Text style={[detailStyles.intro, { color: theme.colors.text }]}>{place.description}</Text>
      <View style={[detailStyles.infoCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><InfoRow label="Location" value={place.location.label} icon="⌖" /><InfoRow label="Designation" value={place.designation ?? 'Not yet recorded'} icon="◇" /><InfoRow label="Time" value={place.periodSummary} icon="◷" /></View>
      <View style={detailStyles.section}><SectionHeader title="Periods and dates" detail="A period filter is a discovery aid, not a historical ruling." /><View style={detailStyles.periodPills}>{place.periodIds.length ? place.periodIds.map((id) => <View key={id} style={[detailStyles.periodPill, { backgroundColor: theme.colors.accentSoft }]}><Text style={[detailStyles.periodPillText, { color: theme.colors.accentStrong }]}>{MOBILE_PERIODS.find((period) => period.id === id)?.name ?? id}</Text></View>) : <Text style={[detailStyles.muted, { color: theme.colors.textMuted }]}>No dated period is recorded for this place yet.</Text>}</View></View>
      <View style={detailStyles.section}><SectionHeader title="People connected to this place" detail={relatedState === 'loading' ? 'Following graph-backed relationships…' : people.length ? 'Graph relationships retain their specific predicate.' : 'No people are recorded here yet.'} />{relatedState === 'loading' ? <AsyncNotice kind="loading" title="Reading connected records" detail="Whilom keeps people and related places tied to the published graph." /> : null}{relatedState === 'error' ? <AsyncNotice kind="error" title="Connected records unavailable" detail={relatedError ?? 'Whilom could not load this place’s connected records.'} action="Try again" onAction={() => setReloadToken((current) => current + 1)} /> : null}<View style={detailStyles.relationshipStack}>{people.map((person) => <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`Open person ${person.name}`} onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.id } })} style={[detailStyles.relationship, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[detailStyles.miniAvatar, { backgroundColor: theme.colors.accentSoft }]}><Text style={[detailStyles.miniAvatarText, { color: theme.colors.accentStrong }]}>{person.name.charAt(0)}</Text></View><View style={{ flex: 1 }}><Text style={[detailStyles.relationshipName, { color: theme.colors.text }]}>{person.name}</Text><Text style={[detailStyles.relationshipDetail, { color: theme.colors.textMuted }]}>{person.placeLinks.find((link) => link.placeId === place.id) ? relationshipLabel(person.placeLinks.find((link) => link.placeId === place.id)!.predicate) : 'connected to'} · {person.role}</Text></View><Text style={[uiStyles.chevron, { color: theme.colors.textFaint }]}>›</Text></Pressable>)}</View></View>
      <View style={detailStyles.section}><SectionHeader title="Related places" detail="Related means a recorded graph relationship, not a recommendation." /><View style={detailStyles.relationshipStack}>{relatedPlaces.map((related) => <PlaceCard key={related.id} place={related} compact onPress={() => router.push({ pathname: '/place/[id]', params: { id: related.id } })} />)}</View>{!relatedPlaces.length ? <Text style={[detailStyles.muted, { color: theme.colors.textMuted }]}>No related place edges are available in this source.</Text> : null}</View>
      <View style={[detailStyles.sourceCard, { backgroundColor: theme.colors.surfaceMuted }]}><Text style={[detailStyles.sourceLabel, { color: theme.colors.textFaint }]}>PROVENANCE</Text><Text style={[detailStyles.sourceText, { color: theme.colors.text }]}>{place.source}</Text>{place.thumbnailUrl ? <Text style={[detailStyles.sourceUrl, { color: theme.colors.accent }]}>Rights-safe thumbnail available from the published media contract.</Text> : null}<Text style={[detailStyles.sourceNote, { color: theme.colors.textMuted }]}>Whilom keeps source attribution alongside the place record.</Text></View>
    </ScrollView>
  );
}

const detailStyles = StyleSheet.create({
  content: { paddingBottom: 40, gap: 17 },
  topBar: { paddingHorizontal: 16, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { fontSize: 30, lineHeight: 32, marginTop: -2 },
  hero: { minHeight: 240, marginHorizontal: 16, borderRadius: 8, padding: 20, justifyContent: 'flex-end', overflow: 'hidden' },
  heroTexture: { position: 'absolute', width: 260, height: 260, borderWidth: 1, borderRadius: 130, right: -64, top: -60 },
  heroIcon: { width: 58, height: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 38 },
  heroCategory: { fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  heroTitle: { fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -0.7, marginTop: 5 },
  heroLocation: { fontSize: 13, marginTop: 5 },
  actionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  actionButton: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 11, justifyContent: 'center' },
  actionText: { fontSize: 12, fontWeight: '800' },
  intro: { paddingHorizontal: 16, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  infoCard: { marginHorizontal: 16, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12 },
  section: { paddingHorizontal: 16, gap: 7 },
  periodPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  periodPill: { borderRadius: 4, paddingHorizontal: 10, paddingVertical: 7 },
  periodPillText: { fontSize: 12, fontWeight: '800' },
  relationshipStack: { gap: 9 },
  relationship: { borderWidth: 1, borderRadius: 8, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  miniAvatarText: { fontSize: 16, fontWeight: '800' },
  relationshipName: { fontSize: 14, fontWeight: '800' },
  relationshipDetail: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  sourceCard: { marginHorizontal: 16, borderRadius: 8, padding: 14, gap: 5 },
  sourceLabel: { fontSize: 9, letterSpacing: 1.1, fontWeight: '900' },
  sourceText: { fontSize: 13, fontWeight: '800' },
  sourceUrl: { fontSize: 10 },
  sourceNote: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  muted: { fontSize: 12, lineHeight: 18 },
});
