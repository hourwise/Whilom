import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { relationshipLabel, type DiscoveryDataSource, type DiscoveryPerson, type DiscoveryPlace } from '@whilom/discovery';
import { BrandMark, EmptyState, PlaceCard, SectionHeader, styles as uiStyles } from '../components/WhilomUI';
import { useMobileTheme } from '../theme';

export default function PersonDetailScreen({ person, source }: { person: DiscoveryPerson; source: DiscoveryDataSource }) {
  const theme = useMobileTheme();
  const [places, setPlaces] = useState<Array<{ place: DiscoveryPlace; predicate: string; note: string }>>([]);
  const [relatedPeople, setRelatedPeople] = useState<DiscoveryPerson[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(person.placeLinks.map(async (link) => ({ link, place: await source.getPlace(link.placeId) }))).then((results) => {
      if (!cancelled) setPlaces(results.flatMap(({ link, place }) => place ? [{ place, predicate: link.predicate, note: link.note }] : []));
    });
    void Promise.all(person.relatedPeople.map((id) => source.getPerson(id))).then((results) => {
      if (!cancelled) setRelatedPeople(results.filter((related): related is DiscoveryPerson => Boolean(related)));
    });
    return () => { cancelled = true; };
  }, [person.placeLinks, person.relatedPeople, source]);
  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={personStyles.content}>
      <View style={personStyles.topBar}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[personStyles.backButton, { backgroundColor: theme.colors.surface }]}><Text style={[personStyles.backGlyph, { color: theme.colors.text }]}>‹</Text></Pressable><BrandMark eyebrow="PERSON DETAIL" /><View style={{ width: 38 }} /></View>
      <View style={[personStyles.identity, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[personStyles.avatar, { backgroundColor: theme.colors.accentSoft }]}><Text style={[personStyles.avatarText, { color: theme.colors.accentStrong }]}>{person.name.charAt(0)}</Text></View><Text style={[personStyles.name, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>{person.name}</Text><Text style={[personStyles.lifeDates, { color: theme.colors.accent }]}>{person.lifeDates}</Text><Text style={[personStyles.role, { color: theme.colors.textMuted }]}>{person.role}</Text></View>
      <Text style={[personStyles.description, { color: theme.colors.text }]}>{person.description}</Text>
      <View style={personStyles.section}><SectionHeader title="Places in their story" detail="Each link retains the relationship predicate and its source note." /><View style={personStyles.stack}>{places.map(({ place, predicate, note }) => <View key={place.id} style={personStyles.linkBlock}><Text style={[personStyles.predicate, { color: theme.colors.accent }]}>{relationshipLabel(predicate).toUpperCase()}</Text><PlaceCard place={place} compact onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} /><Text style={[personStyles.linkNote, { color: theme.colors.textMuted }]}>{note}</Text></View>)}</View>{!places.length ? <EmptyState icon="◌" title="No place links yet" detail="Whilom only shows relationships supported by the heritage graph." /> : null}</View>
      <View style={personStyles.section}><SectionHeader title="Related people" detail="Only graph-backed relationships are shown." />{relatedPeople.length ? <View style={personStyles.stack}>{relatedPeople.map((related) => <Pressable key={related.id} accessibilityRole="button" accessibilityLabel={`Open person ${related.name}`} onPress={() => router.push({ pathname: '/person/[id]', params: { id: related.id } })} style={[personStyles.related, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[personStyles.relatedName, { color: theme.colors.text }]}>{related.name}</Text><Text style={[personStyles.relatedDates, { color: theme.colors.textMuted }]}>{related.lifeDates}</Text><Text style={[uiStyles.chevron, { color: theme.colors.textFaint }]}>›</Text></Pressable>)}</View> : <Text style={[personStyles.muted, { color: theme.colors.textMuted }]}>No related-person edges are recorded in this source.</Text>}</View>
    </ScrollView>
  );
}

const personStyles = StyleSheet.create({
  content: { paddingBottom: 40, gap: 17 },
  topBar: { paddingHorizontal: 16, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 38, height: 38, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { fontSize: 30, lineHeight: 32, marginTop: -2 },
  identity: { marginHorizontal: 16, borderWidth: 1, borderRadius: 8, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 34, fontWeight: '900' },
  name: { fontSize: 27, lineHeight: 32, fontWeight: '900', textAlign: 'center', letterSpacing: -0.6 },
  lifeDates: { fontSize: 14, fontWeight: '800', marginTop: 5 },
  role: { fontSize: 13, marginTop: 3 },
  description: { paddingHorizontal: 16, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  section: { paddingHorizontal: 16, gap: 7 },
  stack: { gap: 10 },
  linkBlock: { gap: 5 },
  predicate: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  linkNote: { fontSize: 11, lineHeight: 16 },
  related: { borderWidth: 1, borderRadius: 8, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  relatedName: { flex: 1, fontSize: 14, fontWeight: '800' },
  relatedDates: { fontSize: 11 },
  muted: { fontSize: 13, lineHeight: 19 },
});
