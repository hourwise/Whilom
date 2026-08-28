import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { DemoPlace, developmentDataSource, relationshipLabel } from '../lib/fixtures';
import { MOBILE_PERIODS } from '../lib/periods';
import { BrandMark, IconGlyph, InfoRow, PlaceCard, SaveButton, SectionHeader, styles as uiStyles } from '../components/WhilomUI';
import { categoryForPlace, type DemoPerson } from '../lib/fixtures';
import { useMobileTheme } from '../theme';

export default function PlaceDetailScreen({ place }: { place: DemoPlace }) {
  const theme = useMobileTheme();
  const category = categoryForPlace(place);
  const people = place.people.map((id) => developmentDataSource.personById(id)).filter((person): person is DemoPerson => Boolean(person));
  const relatedPlaces = place.relatedPlaces.map((id) => developmentDataSource.placeById(id)).filter((related): related is DemoPlace => Boolean(related));

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={detailStyles.content}>
      <View style={detailStyles.topBar}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[detailStyles.backButton, { backgroundColor: theme.colors.surface }]}><Text style={[detailStyles.backGlyph, { color: theme.colors.text }]}>‹</Text></Pressable><BrandMark eyebrow="PLACE DETAIL" /><View style={{ width: 38 }} /></View>
      <View style={[detailStyles.hero, { backgroundColor: category.colour }]}>
        <View style={detailStyles.heroTexture} />
        <View style={detailStyles.heroIcon}><IconGlyph symbol={category.symbol} colour={theme.colors.white} size={32} /></View>
        <Text style={detailStyles.heroCategory}>{category.label.toUpperCase()}  ·  {place.placeType.replace(/_/g, ' ')}</Text>
        <Text style={detailStyles.heroTitle}>{place.name}</Text>
        <Text style={detailStyles.heroLocation}>{place.location.label}</Text>
      </View>
      <View style={detailStyles.actionRow}>
        <SaveButton saved={place.saved} onPress={() => undefined} />
        <Pressable accessibilityRole="button" onPress={() => undefined} style={[detailStyles.actionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[detailStyles.actionText, { color: theme.colors.text }]}>Visited</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => undefined} style={[detailStyles.actionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[detailStyles.actionText, { color: theme.colors.text }]}>Directions ↗</Text></Pressable>
      </View>
      <Text style={[detailStyles.intro, { color: theme.colors.text }]}>{place.description}</Text>
      <View style={[detailStyles.infoCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <InfoRow label="Location" value={place.location.label} icon="⌖" />
        <InfoRow label="Designation" value={place.designation ?? 'Not yet recorded'} icon="◇" />
        <InfoRow label="Time" value={place.periodSummary} icon="◷" />
      </View>
      <View style={detailStyles.section}>
        <SectionHeader title="Periods and dates" detail="Evidence is shown with its source, not guessed." />
        <View style={detailStyles.periodPills}>{place.periodIds.map((id) => <View key={id} style={[detailStyles.periodPill, { backgroundColor: theme.colors.accentSoft }]}><Text style={[detailStyles.periodPillText, { color: theme.colors.accentStrong }]}>{MOBILE_PERIODS.find((period) => period.id === id)?.label ?? id}</Text></View>)}</View>
      </View>
      <View style={detailStyles.section}>
        <SectionHeader title="People connected to this place" detail={people.length ? 'Graph relationships retain their specific predicate.' : 'No people are recorded here yet.'} />
        <View style={detailStyles.relationshipStack}>{people.map((person) => {
          const link = person.placeLinks.find((item) => item.placeId === place.id);
          return <Pressable key={person.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.id } })} style={[detailStyles.relationship, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[detailStyles.miniAvatar, { backgroundColor: theme.colors.accentSoft }]}><Text style={[detailStyles.miniAvatarText, { color: theme.colors.accentStrong }]}>{person.name.charAt(0)}</Text></View><View style={{ flex: 1 }}><Text style={[detailStyles.relationshipName, { color: theme.colors.text }]}>{person.name}</Text><Text style={[detailStyles.relationshipDetail, { color: theme.colors.textMuted }]}>{link ? relationshipLabel(link.predicate) : 'connected to'} · {link?.note ?? person.role}</Text></View><Text style={[uiStyles.chevron, { color: theme.colors.textFaint }]}>›</Text></Pressable>;
        })}</View>
      </View>
      <View style={detailStyles.section}>
        <SectionHeader title="Related places" detail="Related means a recorded graph relationship, not a recommendation." />
        <View style={detailStyles.relationshipStack}>{relatedPlaces.map((related) => <PlaceCard key={related.id} place={related} compact onPress={() => router.push({ pathname: '/place/[id]', params: { id: related.id } })} />)}</View>
      </View>
      <View style={[detailStyles.sourceCard, { backgroundColor: theme.colors.surfaceMuted }]}><Text style={[detailStyles.sourceLabel, { color: theme.colors.textFaint }]}>PROVENANCE</Text><Text style={[detailStyles.sourceText, { color: theme.colors.text }]}>{place.source}</Text>{place.sourceUrl ? <Text style={[detailStyles.sourceUrl, { color: theme.colors.accent }]}>{place.sourceUrl}</Text> : null}<Text style={[detailStyles.sourceNote, { color: theme.colors.textMuted }]}>Whilom keeps source attribution alongside the place record.</Text></View>
    </ScrollView>
  );
}

const detailStyles = StyleSheet.create({
  content: { paddingBottom: 40, gap: 17 },
  topBar: { paddingHorizontal: 18, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { fontSize: 30, lineHeight: 32, marginTop: -2 },
  hero: { minHeight: 240, marginHorizontal: 18, borderRadius: 22, padding: 22, justifyContent: 'flex-end', overflow: 'hidden' },
  heroTexture: { position: 'absolute', width: 260, height: 260, borderWidth: 1, borderColor: '#ffffff30', borderRadius: 130, right: -64, top: -60 },
  heroIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#00000025', alignItems: 'center', justifyContent: 'center', marginBottom: 38 },
  heroCategory: { color: '#ffffffd9', fontSize: 10, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 29, lineHeight: 33, fontWeight: '900', letterSpacing: -0.7, marginTop: 5 },
  heroLocation: { color: '#ffffffd9', fontSize: 13, marginTop: 5 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 18 },
  actionButton: { minHeight: 38, borderWidth: 1, borderRadius: 19, paddingHorizontal: 13, justifyContent: 'center' },
  actionText: { fontSize: 12, fontWeight: '800' },
  intro: { paddingHorizontal: 18, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  infoCard: { marginHorizontal: 18, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13 },
  section: { paddingHorizontal: 18, gap: 7 },
  periodPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  periodPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  periodPillText: { fontSize: 12, fontWeight: '800' },
  relationshipStack: { gap: 9 },
  relationship: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  miniAvatarText: { fontSize: 16, fontWeight: '800' },
  relationshipName: { fontSize: 14, fontWeight: '800' },
  relationshipDetail: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  sourceCard: { marginHorizontal: 18, borderRadius: 15, padding: 14, gap: 5 },
  sourceLabel: { fontSize: 9, letterSpacing: 1.1, fontWeight: '900' },
  sourceText: { fontSize: 13, fontWeight: '800' },
  sourceUrl: { fontSize: 10 },
  sourceNote: { fontSize: 11, lineHeight: 16, marginTop: 3 },
});

