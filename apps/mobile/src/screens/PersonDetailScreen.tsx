import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { DemoPerson, developmentDataSource, relationshipLabel } from '../lib/fixtures';
import { BrandMark, EmptyState, PlaceCard, SectionHeader, styles as uiStyles } from '../components/WhilomUI';
import { useMobileTheme } from '../theme';

export default function PersonDetailScreen({ person }: { person: DemoPerson }) {
  const theme = useMobileTheme();
  const places = person.placeLinks.map((link) => ({ link, place: developmentDataSource.placeById(link.placeId) })).filter((item): item is { link: (typeof person.placeLinks)[number]; place: NonNullable<ReturnType<typeof developmentDataSource.placeById>> } => Boolean(item.place));
  const relatedPeople = person.relatedPeople.map((id) => developmentDataSource.personById(id)).filter(Boolean);
  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={personStyles.content}>
      <View style={personStyles.topBar}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[personStyles.backButton, { backgroundColor: theme.colors.surface }]}><Text style={[personStyles.backGlyph, { color: theme.colors.text }]}>‹</Text></Pressable><BrandMark eyebrow="PERSON DETAIL" /><View style={{ width: 38 }} /></View>
      <View style={[personStyles.identity, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <View style={[personStyles.avatar, { backgroundColor: theme.colors.accentSoft }]}><Text style={[personStyles.avatarText, { color: theme.colors.accentStrong }]}>{person.name.charAt(0)}</Text></View>
        <Text style={[personStyles.name, { color: theme.colors.text }]}>{person.name}</Text>
        <Text style={[personStyles.lifeDates, { color: theme.colors.accent }]}>{person.lifeDates}</Text>
        <Text style={[personStyles.role, { color: theme.colors.textMuted }]}>{person.role}</Text>
      </View>
      <Text style={[personStyles.description, { color: theme.colors.text }]}>{person.description}</Text>
      <View style={personStyles.section}>
        <SectionHeader title="Places in their story" detail="Each link retains the relationship predicate and its source note." />
        <View style={personStyles.stack}>{places.map(({ link, place }) => <View key={place.id} style={personStyles.linkBlock}><Text style={[personStyles.predicate, { color: theme.colors.accent }]}>{relationshipLabel(link.predicate).toUpperCase()}</Text><PlaceCard place={place} compact onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} /></View>)}</View>
        {!places.length ? <EmptyState icon="◌" title="No place links yet" detail="Whilom only shows relationships supported by the heritage graph." /> : null}
      </View>
      <View style={personStyles.section}>
        <SectionHeader title="Related people" detail="Only graph-backed relationships are shown." />
        {relatedPeople.length ? <View style={personStyles.stack}>{relatedPeople.map((related) => <Pressable key={related!.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/person/[id]', params: { id: related!.id } })} style={[personStyles.related, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[personStyles.relatedName, { color: theme.colors.text }]}>{related!.name}</Text><Text style={[personStyles.relatedDates, { color: theme.colors.textMuted }]}>{related!.lifeDates}</Text><Text style={[uiStyles.chevron, { color: theme.colors.textFaint }]}>›</Text></Pressable>)}</View> : <Text style={[personStyles.muted, { color: theme.colors.textMuted }]}>No related-person edges are recorded in this fixture.</Text>}
      </View>
    </ScrollView>
  );
}

const personStyles = StyleSheet.create({
  content: { paddingBottom: 40, gap: 17 },
  topBar: { paddingHorizontal: 18, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { fontSize: 30, lineHeight: 32, marginTop: -2 },
  identity: { marginHorizontal: 18, borderWidth: 1, borderRadius: 20, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 34, fontWeight: '900' },
  name: { fontSize: 27, lineHeight: 32, fontWeight: '900', textAlign: 'center', letterSpacing: -0.6 },
  lifeDates: { fontSize: 14, fontWeight: '800', marginTop: 5 },
  role: { fontSize: 13, marginTop: 3 },
  description: { paddingHorizontal: 18, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  section: { paddingHorizontal: 18, gap: 7 },
  stack: { gap: 10 },
  linkBlock: { gap: 5 },
  predicate: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  related: { borderWidth: 1, borderRadius: 13, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  relatedName: { flex: 1, fontSize: 14, fontWeight: '800' },
  relatedDates: { fontSize: 11 },
  muted: { fontSize: 13, lineHeight: 19 },
});

