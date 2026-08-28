import { Pressable, StyleSheet, Text, View } from 'react-native';
import { displayCategory, type DisplayCategory, type MapCluster, type MapPlace } from '@whilom/discovery';
import { useMobileTheme } from '../theme';

export interface MapViewport {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface DiscoveryMarker {
  id: string;
  coordinate: { latitude: number; longitude: number };
  title: string;
  category: DisplayCategory;
  selected?: boolean;
  clusterCount?: number;
}

export interface DiscoveryMapProps {
  viewport: MapViewport;
  markers: DiscoveryMarker[];
  clusters?: MapCluster[];
  selectedPlaceId?: string | null;
  coverageState: 'full' | 'partial' | 'outside';
  userPosition?: { latitude: number; longitude: number };
  onMarkerPress: (marker: DiscoveryMarker) => void;
  onViewportChange?: (viewport: MapViewport) => void;
}

/**
 * Presentational map boundary for Phase 6A.
 *
 * The surrounding product only knows this typed contract. A native map can
 * replace this implementation later without changing discovery state, cards,
 * filters, or detail navigation. The visual canvas below is intentionally a
 * lightweight development presentation, not a geographic renderer.
 */
export function DiscoveryMap({ markers, clusters = [], selectedPlaceId, coverageState, onMarkerPress }: DiscoveryMapProps) {
  const theme = useMobileTheme();
  return (
    <View accessible accessibilityLabel="Whilom map discovery area" style={[styles.frame, { backgroundColor: theme.colors.mapWater, borderColor: theme.colors.border }]}>
      <View style={[styles.landMass, { backgroundColor: theme.colors.mapLand }]} />
      <View style={styles.topographicLineOne} />
      <View style={styles.topographicLineTwo} />
      <View style={styles.mapHeader}>
        <View style={[styles.mapChip, { backgroundColor: `${theme.colors.surface}e8` }]}>
          <Text style={[styles.mapChipText, { color: theme.colors.text }]}>MAP PREVIEW</Text>
        </View>
        <View style={[styles.mapChip, { backgroundColor: `${theme.colors.surface}e8` }]}>
          <Text style={[styles.mapChipText, { color: theme.colors.textMuted }]}>{markers.length} places</Text>
        </View>
      </View>
      {markers.map((marker, index) => {
        const left = 16 + ((index * 37) % 72);
        const top = 28 + ((index * 47) % 48);
        const selected = selectedPlaceId === marker.id || marker.selected;
        return (
          <Pressable key={marker.id} accessibilityRole="button" accessibilityLabel={`Show ${marker.title}`} onPress={() => onMarkerPress(marker)} hitSlop={5} style={[styles.marker, { left: `${left}%`, top: `${top}%` }]}>
            <View style={[styles.markerDot, { backgroundColor: marker.category.colour, borderColor: selected ? theme.colors.white : `${theme.colors.white}cc`, transform: [{ scale: selected ? 1.22 : 1 }] }]}>
              <Text style={[styles.markerSymbol, { color: theme.colors.white }]}>{marker.category.symbol}</Text>
            </View>
            {selected ? <View style={[styles.markerCallout, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text numberOfLines={1} style={[styles.markerCalloutText, { color: theme.colors.text }]}>{marker.title}</Text></View> : null}
          </Pressable>
        );
      })}
      {markers.length === 0 && clusters.map((cluster, index) => {
        const left = 18 + ((index * 43) % 68);
        const top = 34 + ((index * 31) % 36);
        return <View key={cluster.cell_key} accessible accessibilityRole="image" accessibilityLabel={`${cluster.place_count} places in this map cluster`} style={[styles.cluster, { left: `${left}%`, top: `${top}%`, backgroundColor: theme.colors.accent, borderColor: `${theme.colors.white}cc` }]}><Text style={[styles.clusterText, { color: theme.colors.white }]}>{cluster.place_count}</Text></View>;
      })}
      {coverageState !== 'full' ? (
        <View style={[styles.coverageStripe, { backgroundColor: `${theme.colors.warning}22`, borderColor: `${theme.colors.warning}66` }]}>
          <Text style={[styles.coverageStripeText, { color: theme.colors.text }]}>Detailed coverage {coverageState === 'outside' ? 'not activated here' : 'currently partial'}</Text>
        </View>
      ) : null}
      <View style={[styles.mapCompass, { backgroundColor: theme.colors.surface }]}><Text style={[styles.mapCompassText, { color: theme.colors.accent }]}>N</Text></View>
      <View style={[styles.mapScale, { backgroundColor: theme.colors.surface }]}><Text style={[styles.mapScaleText, { color: theme.colors.textMuted }]}>2 mi</Text></View>
    </View>
  );
}

export function markersForPlaces(places: readonly MapPlace[], selectedPlaceId?: string | null): DiscoveryMarker[] {
  return places.map((place) => ({
    id: place.id,
    coordinate: { latitude: place.lat, longitude: place.lng },
    title: place.name,
    category: displayCategory(place.display_category),
    selected: place.id === selectedPlaceId,
  }));
}

const styles = StyleSheet.create({
  frame: { height: 310, borderWidth: 1, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  landMass: { position: 'absolute', width: '125%', height: '92%', left: '-12%', top: '8%', borderRadius: 120, transform: [{ rotate: '-13deg' }] },
  topographicLineOne: { position: 'absolute', width: '120%', height: 110, left: '-8%', top: 75, borderWidth: 1, borderColor: '#ffffff2c', borderRadius: 70, transform: [{ rotate: '-12deg' }] },
  topographicLineTwo: { position: 'absolute', width: '110%', height: 80, left: '-5%', top: 140, borderWidth: 1, borderColor: '#ffffff3a', borderRadius: 60, transform: [{ rotate: '8deg' }] },
  mapHeader: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  mapChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 },
  mapChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  marker: { position: 'absolute', alignItems: 'center', minWidth: 34, minHeight: 34 },
  markerDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  markerSymbol: { fontSize: 14, fontWeight: '800' },
  markerCallout: { maxWidth: 140, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, marginTop: 3, borderWidth: 1 },
  markerCalloutText: { fontSize: 10, fontWeight: '800' },
  cluster: { position: 'absolute', width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  clusterText: { fontSize: 12, fontWeight: '900' },
  coverageStripe: { position: 'absolute', bottom: 14, left: 14, right: 14, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderRadius: 8 },
  coverageStripeText: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  mapCompass: { position: 'absolute', right: 12, bottom: 46, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mapCompassText: { fontSize: 12, fontWeight: '900' },
  mapScale: { position: 'absolute', left: 12, bottom: 15, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5 },
  mapScaleText: { fontSize: 9, fontWeight: '700' },
});
