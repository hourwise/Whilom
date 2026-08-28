import { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { DemoPerson, DemoPlace, categoryForPlace, relationshipLabel } from '../lib/fixtures';
import { MOBILE_PERIODS, TIME_MODE_OPTIONS, type MobileTimeMode } from '../lib/periods';
import { DISPLAY_CATEGORIES, type DisplayCategoryId } from '../lib/taxonomy';
import { formatDistance, useMobileTheme } from '../theme';

export function ScreenShell({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const theme = useMobileTheme();
  const content = <View style={[styles.shell, { backgroundColor: theme.colors.background }]}>{children}</View>;
  if (!scroll) return content;
  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.scrollContent}>{children}</ScrollView>;
}

export function BrandMark({ eyebrow = 'HERITAGE, IN PLACE' }: { eyebrow?: string }) {
  const theme = useMobileTheme();
  return (
    <View style={styles.brandRow}>
      <View style={[styles.brandMark, { backgroundColor: theme.colors.accent }]}>
        <Text style={[styles.brandMarkText, { color: theme.colors.white }]}>W</Text>
      </View>
      <View>
        <Text style={[styles.brandName, { color: theme.colors.text }]}>Whilom</Text>
        <Text style={[styles.brandEyebrow, { color: theme.colors.textFaint }]}>{eyebrow}</Text>
      </View>
    </View>
  );
}

export function IconGlyph({ symbol, colour, size = 18 }: { symbol: string; colour?: string; size?: number }) {
  return <Text style={{ color: colour, fontSize: size, lineHeight: size + 2 }}>{symbol}</Text>;
}

export function SectionHeader({ title, detail, action, onAction }: { title: string; detail?: string; action?: string; onAction?: () => void }) {
  const theme = useMobileTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
        {detail ? <Text style={[styles.sectionDetail, { color: theme.colors.textMuted }]}>{detail}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text style={[styles.sectionAction, { color: theme.colors.accent }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Pill({ label, selected = false, onPress, icon, style }: { label: string; selected?: boolean; onPress?: () => void; icon?: string; style?: StyleProp<ViewStyle> }) {
  const theme = useMobileTheme();
  const body = (
    <View style={[styles.pill, { backgroundColor: selected ? theme.colors.accent : theme.colors.surface, borderColor: selected ? theme.colors.accent : theme.colors.border }, style]}>
      {icon ? <IconGlyph symbol={icon} size={14} colour={selected ? theme.colors.white : theme.colors.textMuted} /> : null}
      <Text style={[styles.pillLabel, { color: selected ? theme.colors.white : theme.colors.text }]}>{label}</Text>
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}>{body}</Pressable> : body;
}

export function SearchField({ value, onChangeText, onSubmitEditing, placeholder = 'Search places or people' }: { value: string; onChangeText: (value: string) => void; onSubmitEditing?: () => void; placeholder?: string }) {
  const theme = useMobileTheme();
  return (
    <View style={[styles.searchField, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <IconGlyph symbol="⌕" size={24} colour={theme.colors.accent} />
      <TextInput
        accessibilityLabel="Search places or people"
        returnKeyType="search"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textFaint}
        style={[styles.searchInput, { color: theme.colors.text }]}
      />
      {value ? <Text style={[styles.searchScope, { color: theme.colors.textFaint }]}>ALL</Text> : null}
    </View>
  );
}

export function CoverageNotice({ level, text }: { level: 'none' | 'partial' | 'full'; text: string }) {
  const theme = useMobileTheme();
  if (level === 'full') return null;
  const colour = level === 'none' ? theme.colors.warning : theme.colors.accent;
  return (
    <View style={[styles.coverageNotice, { backgroundColor: level === 'none' ? `${theme.colors.warning}18` : theme.colors.accentSoft, borderColor: `${colour}55` }]}>
      <IconGlyph symbol={level === 'none' ? '◌' : '◐'} colour={colour} size={18} />
      <Text style={[styles.coverageText, { color: theme.colors.text }]}>{text}</Text>
    </View>
  );
}

export function MapKey({ activeCategory, onToggle }: { activeCategory: DisplayCategoryId | null; onToggle: (id: DisplayCategoryId) => void }) {
  const theme = useMobileTheme();
  return (
    <View>
      <SectionHeader title="Map key" detail="Tap a group to filter the map" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
        {DISPLAY_CATEGORIES.map((category) => {
          const selected = activeCategory === category.id;
          return (
            <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={`Filter by ${category.label}`} accessibilityState={{ selected }} onPress={() => onToggle(category.id)} style={[styles.keyItem, { backgroundColor: selected ? `${category.colour}22` : theme.colors.surface, borderColor: selected ? category.colour : theme.colors.border }]}>
              <IconGlyph symbol={category.symbol} colour={category.colour} size={16} />
              <Text style={[styles.keyLabel, { color: theme.colors.text }]}>{category.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function TimeRuler({ mode, selectedPeriod, onModeChange, onPeriodChange }: { mode: MobileTimeMode; selectedPeriod: string | null; onModeChange: (mode: MobileTimeMode) => void; onPeriodChange: (periodId: string | null) => void }) {
  const theme = useMobileTheme();
  return (
    <View>
      <SectionHeader title="When" detail="A time filter narrows the records Whilom holds" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
        {TIME_MODE_OPTIONS.map((option) => <Pill key={option.id} label={option.label} selected={mode === option.id} onPress={() => onModeChange(option.id)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.periodRow, { borderColor: theme.colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear period" accessibilityState={{ selected: selectedPeriod === null }} onPress={() => onPeriodChange(null)} style={[styles.periodItem, { borderColor: selectedPeriod === null ? theme.colors.accent : theme.colors.border, backgroundColor: selectedPeriod === null ? theme.colors.accentSoft : theme.colors.surface }]}>
          <Text style={[styles.periodLabel, { color: selectedPeriod === null ? theme.colors.accentStrong : theme.colors.textMuted }]}>Any period</Text>
        </Pressable>
        {MOBILE_PERIODS.map((period) => {
          const selected = selectedPeriod === period.id;
          return (
            <Pressable key={period.id} accessibilityRole="button" accessibilityLabel={`Filter by ${period.label}`} accessibilityState={{ selected }} onPress={() => onPeriodChange(selected ? null : period.id)} style={[styles.periodItem, { borderColor: selected ? theme.colors.accent : theme.colors.border, backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface }]}>
              <Text style={[styles.periodLabel, { color: selected ? theme.colors.accentStrong : theme.colors.text }]}>{period.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={[styles.timeHint, { color: theme.colors.textFaint }]}>{TIME_MODE_OPTIONS.find((option) => option.id === mode)?.hint}</Text>
    </View>
  );
}

export function PlaceCard({ place, onPress, onSave, compact = false }: { place: DemoPlace; onPress: () => void; onSave?: () => void; compact?: boolean }) {
  const theme = useMobileTheme();
  const category = categoryForPlace(place);
  const distance = formatDistance(place.distanceMiles);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.placeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, compact && styles.placeCardCompact]}>
      <View style={[styles.placeAccent, { backgroundColor: category.colour }]} />
      <View style={styles.placeCardBody}>
        <View style={styles.cardTopline}>
          <View style={styles.categoryLine}>
            <IconGlyph symbol={category.symbol} colour={category.colour} size={15} />
            <Text style={[styles.cardEyebrow, { color: theme.colors.textMuted }]}>{category.label}</Text>
          </View>
          {onSave ? <SaveButton saved={place.saved} onPress={onSave} compact /> : null}
        </View>
        <Text numberOfLines={2} style={[styles.placeName, { color: theme.colors.text }]}>{place.name}</Text>
        <Text numberOfLines={1} style={[styles.placeLocation, { color: theme.colors.textMuted }]}>{place.location.label}{distance ? `  ·  ${distance}` : ''}</Text>
        {!compact ? <Text numberOfLines={2} style={[styles.placePeriod, { color: theme.colors.textMuted }]}>{place.periodSummary}</Text> : null}
        <View style={styles.badgeRow}>
          {place.designation ? <Text numberOfLines={1} style={[styles.designationBadge, { backgroundColor: theme.colors.surfaceMuted, color: theme.colors.textMuted }]}>{place.designation}</Text> : null}
          {place.visited ? <Text style={[styles.visitedBadge, { color: theme.colors.success }]}>Visited</Text> : null}
        </View>
      </View>
      <Text style={[styles.chevron, { color: theme.colors.textFaint }]}>›</Text>
    </Pressable>
  );
}

export function PersonCard({ person, onPress }: { person: DemoPerson; onPress: () => void }) {
  const theme = useMobileTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.personCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={[styles.personAvatar, { backgroundColor: theme.colors.accentSoft }]}><Text style={[styles.personInitial, { color: theme.colors.accentStrong }]}>{person.name.charAt(0)}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.personName, { color: theme.colors.text }]}>{person.name}</Text>
        <Text style={[styles.personMeta, { color: theme.colors.textMuted }]}>{person.lifeDates}  ·  {person.role}</Text>
      </View>
      <Text style={[styles.chevron, { color: theme.colors.textFaint }]}>›</Text>
    </Pressable>
  );
}

export function SaveButton({ saved, onPress, compact = false }: { saved: boolean; onPress: () => void; compact?: boolean }) {
  const theme = useMobileTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved places' : 'Save place'} accessibilityState={{ selected: saved }} onPress={onPress} hitSlop={8} style={[styles.saveButton, compact && styles.saveButtonCompact, { backgroundColor: saved ? theme.colors.accentSoft : theme.colors.surfaceMuted }]}>
      <Text style={[styles.saveGlyph, { color: saved ? theme.colors.accentStrong : theme.colors.textMuted }]}>{saved ? '♥' : '♡'}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon, title, detail, action, onAction }: { icon: string; title: string; detail: string; action?: string; onAction?: () => void }) {
  const theme = useMobileTheme();
  return (
    <View style={[styles.emptyState, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.colors.accentSoft }]}><IconGlyph symbol={icon} colour={theme.colors.accent} size={24} /></View>
      <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.emptyDetail, { color: theme.colors.textMuted }]}>{detail}</Text>
      {action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={[styles.primaryButton, { backgroundColor: theme.colors.accent }]}><Text style={[styles.primaryButtonText, { color: theme.colors.white }]}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function InfoRow({ label, value, icon }: { label: string; value: string; icon?: string }) {
  const theme = useMobileTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: theme.colors.border }]}>
      {icon ? <IconGlyph symbol={icon} colour={theme.colors.accent} size={17} /> : null}
      <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

export const uiStyles = StyleSheet.create({
  shell: { flex: 1 },
  scrollContent: { paddingBottom: 36 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { fontSize: 22, fontWeight: '800', letterSpacing: -1 },
  brandName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  brandEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginTop: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  sectionDetail: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  sectionAction: { fontSize: 13, fontWeight: '800' },
  pill: { minHeight: 38, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  pillLabel: { fontSize: 13, fontWeight: '700' },
  searchField: { borderWidth: 1, borderRadius: 14, minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9 },
  searchInput: { flex: 1, fontSize: 16, minHeight: 48 },
  searchScope: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  coverageNotice: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  coverageText: { flex: 1, fontSize: 12, lineHeight: 17 },
  horizontalRow: { gap: 8, paddingBottom: 3 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9 },
  keyLabel: { fontSize: 12, fontWeight: '700' },
  periodRow: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 10, gap: 8, marginTop: 12 },
  periodItem: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  periodLabel: { fontSize: 12, fontWeight: '700' },
  timeHint: { fontSize: 11, marginTop: 7 },
  placeCard: { borderWidth: 1, borderRadius: 16, flexDirection: 'row', overflow: 'hidden', minHeight: 130 },
  placeCardCompact: { minHeight: 96 },
  placeAccent: { width: 6 },
  placeCardBody: { flex: 1, padding: 13, gap: 4 },
  cardTopline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  placeName: { fontSize: 17, lineHeight: 21, fontWeight: '800', letterSpacing: -0.2 },
  placeLocation: { fontSize: 12 },
  placePeriod: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  designationBadge: { maxWidth: '86%', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, fontSize: 10 },
  visitedBadge: { fontSize: 10, fontWeight: '800' },
  chevron: { fontSize: 26, paddingRight: 10, alignSelf: 'center' },
  saveButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  saveButtonCompact: { width: 28, height: 28, borderRadius: 14 },
  saveGlyph: { fontSize: 18 },
  personCard: { minHeight: 74, borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  personAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  personInitial: { fontSize: 19, fontWeight: '800' },
  personName: { fontSize: 15, fontWeight: '800' },
  personMeta: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  emptyState: { borderWidth: 1, borderRadius: 18, alignItems: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyDetail: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  primaryButton: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginTop: 16 },
  primaryButtonText: { fontSize: 13, fontWeight: '800' },
  infoRow: { minHeight: 42, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9 },
  infoLabel: { fontSize: 12, width: 100 },
  infoValue: { flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
});

export const styles = uiStyles;
