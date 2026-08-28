import { useEffect, useMemo, useState } from 'react';
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
import { CorrectionForm, ReviewForm, VisitForm } from '../components/BehaviourForms';
import { useMobileBehaviour } from '../lib/behaviour';
import { getMobileRouteRuntime, type MobileRouteSummary } from '../lib/route-source';
import { useMobileSession } from '../lib/session';
import { MOBILE_PERIODS } from '../lib/periods';
import { useMobileTheme } from '../theme';

export default function PlaceDetailScreen({ place, source }: { place: DiscoveryPlace; source: DiscoveryDataSource }) {
  const theme = useMobileTheme();
  const category = displayCategory(place.category);
  const { state: session } = useMobileSession();
  const { isSaved, isVisited, isSaving, isVisiting, toggleSaved, toggleVisited, reviewsForPlace } = useMobileBehaviour();
  const routeRuntime = useMemo(() => getMobileRouteRuntime(), []);
  const [people, setPeople] = useState<DiscoveryPerson[]>([]);
  const [relatedPlaces, setRelatedPlaces] = useState<DiscoveryPlace[]>([]);
  const [relatedState, setRelatedState] = useState<'loading' | 'success' | 'error'>('loading');
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [activeForm, setActiveForm] = useState<'visit' | 'review' | 'correction' | null>(null);
  const [visitedResult, setVisitedResult] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [routes, setRoutes] = useState<MobileRouteSummary[]>([]);
  const [routeState, setRouteState] = useState<'loading' | 'success' | 'error'>('loading');
  const [routeError, setRouteError] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    if (routeRuntime.configuration === 'unavailable') { setRouteState('error'); setRouteError('Live route reads are not configured.'); return () => { cancelled = true; }; }
    setRouteState('loading'); setRouteError(null);
    void routeRuntime.source.getRoutesForPlace(place.id).then((next) => { if (!cancelled) { setRoutes(next); setRouteState('success'); } }).catch((cause: unknown) => { if (!cancelled) { setRouteState('error'); setRouteError(cause instanceof Error ? cause.message : 'Routes could not be loaded.'); } });
    return () => { cancelled = true; };
  }, [place.id, routeRuntime]);

  const saved = isSaved(place.id, place.saved);
  const visited = isVisited(place.id, place.visited);
  const review = reviewsForPlace(place.id)[0];
  function requireAccount() {
    if (session.status !== 'signed_in') { router.push('/auth/sign-in'); return false; }
    return true;
  }
  async function markVisited() {
    if (!requireAccount()) return;
    setVisitedResult('submitting');
    const result = await toggleVisited(place.id, place.visited);
    setVisitedResult(result.status === 'error' ? 'error' : 'idle');
  }
  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={detailStyles.content}>
      <View style={detailStyles.topBar}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[detailStyles.backButton, { width: theme.controls.touchTarget, height: theme.controls.touchTarget, backgroundColor: theme.colors.surface }]}><Text style={[detailStyles.backGlyph, { color: theme.colors.text }]}>‹</Text></Pressable><BrandMark eyebrow="PLACE DETAIL" /><View style={{ width: theme.controls.touchTarget }} /></View>
      <View style={[detailStyles.hero, { backgroundColor: category.colour }]}><View style={[detailStyles.heroTexture, { borderColor: `${theme.colors.white}30` }]} /><View style={[detailStyles.heroIcon, { backgroundColor: `${theme.colors.text}25` }]}><IconGlyph symbol={category.symbol} colour={theme.colors.white} size={32} /></View><Text style={[detailStyles.heroCategory, { color: `${theme.colors.white}d9` }]}>{category.label.toUpperCase()}  ·  {place.placeType.replace(/_/g, ' ')}</Text><Text style={[detailStyles.heroTitle, { color: theme.colors.white, fontFamily: theme.typography.editorial }]}>{place.name}</Text><Text style={[detailStyles.heroLocation, { color: `${theme.colors.white}d9` }]}>{place.location.label}</Text></View>
      <View style={detailStyles.actionRow}><SaveButton saved={saved} busy={isSaving(place.id)} onPress={() => { if (requireAccount()) void toggleSaved(place.id, place.saved); }} /><Pressable accessibilityRole="button" accessibilityLabel={visited ? 'Record another visit' : 'Record a visit'} accessibilityState={{ selected: visited, busy: isVisiting(place.id) || visitedResult === 'submitting' }} onPress={() => void markVisited()} style={[detailStyles.actionButton, { minHeight: theme.controls.touchTarget, backgroundColor: visited ? theme.colors.accentSoft : theme.colors.surface, borderColor: visited ? theme.colors.accent : theme.colors.border, opacity: visitedResult === 'submitting' ? 0.6 : 1 }]}><Text style={[detailStyles.actionText, { color: visited ? theme.colors.accentStrong : theme.colors.text }]}>{visitedResult === 'submitting' ? 'Saving…' : visited ? 'Visited ✓' : 'Mark visited'}</Text></Pressable><Pressable accessibilityRole="link" accessibilityLabel="Directions are available in a later release" accessibilityState={{ disabled: true }} disabled style={[detailStyles.actionButton, { minHeight: theme.controls.touchTarget, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: 0.65 }]}><Text style={[detailStyles.actionText, { color: theme.colors.text }]}>Directions ↗</Text></Pressable></View>
      {visitedResult === 'error' ? <AsyncNotice kind="error" title="Visit could not be recorded" detail="Try again, or open the visit form for more detail." /> : null}
      <View style={detailStyles.actionRow}><Pressable accessibilityRole="button" accessibilityLabel="Record visit details" onPress={() => requireAccount() && setActiveForm(activeForm === 'visit' ? null : 'visit')} style={[detailStyles.actionButton, { minHeight: theme.controls.touchTarget, backgroundColor: activeForm === 'visit' ? theme.colors.accentSoft : theme.colors.surface, borderColor: activeForm === 'visit' ? theme.colors.accent : theme.colors.border }]}><Text style={[detailStyles.actionText, { color: activeForm === 'visit' ? theme.colors.accentStrong : theme.colors.text }]}>Visit details</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={review ? 'Edit your review' : 'Write a review'} onPress={() => requireAccount() && setActiveForm(activeForm === 'review' ? null : 'review')} style={[detailStyles.actionButton, { minHeight: theme.controls.touchTarget, backgroundColor: activeForm === 'review' ? theme.colors.accentSoft : theme.colors.surface, borderColor: activeForm === 'review' ? theme.colors.accent : theme.colors.border }]}><Text style={[detailStyles.actionText, { color: activeForm === 'review' ? theme.colors.accentStrong : theme.colors.text }]}>{review ? 'Edit review' : 'Write review'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Suggest a correction" onPress={() => requireAccount() && setActiveForm(activeForm === 'correction' ? null : 'correction')} style={[detailStyles.actionButton, { minHeight: theme.controls.touchTarget, backgroundColor: activeForm === 'correction' ? theme.colors.accentSoft : theme.colors.surface, borderColor: activeForm === 'correction' ? theme.colors.accent : theme.colors.border }]}><Text style={[detailStyles.actionText, { color: activeForm === 'correction' ? theme.colors.accentStrong : theme.colors.text }]}>Suggest correction</Text></Pressable></View>
      {activeForm === 'visit' ? <VisitForm placeId={place.id} onClose={() => setActiveForm(null)} /> : null}
      {activeForm === 'review' ? <ReviewForm placeId={place.id} existingBody={review?.body} existingRating={review?.rating} onClose={() => setActiveForm(null)} /> : null}
      {activeForm === 'correction' ? <CorrectionForm entityId={place.id} onClose={() => setActiveForm(null)} /> : null}
      <Text style={[detailStyles.intro, { color: theme.colors.text }]}>{place.description}</Text>
      <View style={[detailStyles.infoCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><InfoRow label="Location" value={place.location.label} icon="⌖" /><InfoRow label="Designation" value={place.designation ?? 'Not yet recorded'} icon="◇" /><InfoRow label="Time" value={place.periodSummary} icon="◷" /></View>
      <View style={detailStyles.section}><SectionHeader title="Periods and dates" detail="A period filter is a discovery aid, not a historical ruling." /><View style={detailStyles.periodPills}>{place.periodIds.length ? place.periodIds.map((id) => <View key={id} style={[detailStyles.periodPill, { backgroundColor: theme.colors.accentSoft }]}><Text style={[detailStyles.periodPillText, { color: theme.colors.accentStrong }]}>{MOBILE_PERIODS.find((period) => period.id === id)?.name ?? id}</Text></View>) : <Text style={[detailStyles.muted, { color: theme.colors.textMuted }]}>No dated period is recorded for this place yet.</Text>}</View></View>
      <View style={detailStyles.section}><SectionHeader title="People connected to this place" detail={relatedState === 'loading' ? 'Following graph-backed relationships…' : people.length ? 'Graph relationships retain their specific predicate.' : 'No people are recorded here yet.'} />{relatedState === 'loading' ? <AsyncNotice kind="loading" title="Reading connected records" detail="Whilom keeps people and related places tied to the published graph." /> : null}{relatedState === 'error' ? <AsyncNotice kind="error" title="Connected records unavailable" detail={relatedError ?? 'Whilom could not load this place’s connected records.'} action="Try again" onAction={() => setReloadToken((current) => current + 1)} /> : null}<View style={detailStyles.relationshipStack}>{people.map((person) => <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`Open person ${person.name}`} onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.id } })} style={[detailStyles.relationship, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[detailStyles.miniAvatar, { backgroundColor: theme.colors.accentSoft }]}><Text style={[detailStyles.miniAvatarText, { color: theme.colors.accentStrong }]}>{person.name.charAt(0)}</Text></View><View style={{ flex: 1 }}><Text style={[detailStyles.relationshipName, { color: theme.colors.text }]}>{person.name}</Text><Text style={[detailStyles.relationshipDetail, { color: theme.colors.textMuted }]}>{person.placeLinks.find((link) => link.placeId === place.id) ? relationshipLabel(person.placeLinks.find((link) => link.placeId === place.id)!.predicate) : 'connected to'} · {person.role}</Text></View><Text style={[uiStyles.chevron, { color: theme.colors.textFaint }]}>›</Text></Pressable>)}</View></View>
      <View style={detailStyles.section}><SectionHeader title="Related places" detail="Related means a recorded graph relationship, not a recommendation." /><View style={detailStyles.relationshipStack}>{relatedPlaces.map((related) => <PlaceCard key={related.id} place={related} compact onPress={() => router.push({ pathname: '/place/[id]', params: { id: related.id } })} />)}</View>{!relatedPlaces.length ? <Text style={[detailStyles.muted, { color: theme.colors.textMuted }]}>No related place edges are available in this source.</Text> : null}</View>
      <View style={detailStyles.section}><SectionHeader title="Trails containing this place" detail={routeState === 'loading' ? 'Checking approved route stops…' : 'A route keeps its ordered places and context.'} />{routeState === 'error' ? <AsyncNotice kind="error" title="Trails unavailable" detail={routeError ?? 'Approved routes could not be loaded.'} /> : null}<View style={detailStyles.relationshipStack}>{routes.map((route) => <Pressable key={route.id} accessibilityRole="button" accessibilityLabel={`Open trail ${route.name}`} onPress={() => router.push({ pathname: '/trail/[slug]', params: { slug: route.slug } })} style={[detailStyles.relationship, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={{ flex: 1 }}><Text style={[detailStyles.relationshipName, { color: theme.colors.text }]}>{route.name}</Text><Text style={[detailStyles.relationshipDetail, { color: theme.colors.textMuted }]}>{route.route_type.replace(/_/g, ' ')} · {route.duration_minutes ? `${route.duration_minutes} min` : 'time not recorded'}</Text></View><Text style={[uiStyles.chevron, { color: theme.colors.textFaint }]}>›</Text></Pressable>)}</View>{routeState === 'success' && !routes.length ? <Text style={[detailStyles.muted, { color: theme.colors.textMuted }]}>No approved trail currently includes this place.</Text> : null}</View>
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
