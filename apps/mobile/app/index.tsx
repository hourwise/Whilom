import { StyleSheet, Text, View } from 'react-native';
import { PlaceType } from '@whilom/domain';

/**
 * Placeholder "Near Me" entry screen (spec §28). Phase 6 replaces this with the
 * nearby map, proximity list and concise place pages. Imports the shared domain
 * to prove the monorepo wiring works inside the Expo build.
 */
export default function NearMeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Whilom</Text>
      <Text style={styles.body}>
        Phase 1 scaffold. Nearby discovery, visits and trails arrive in Phase 6.
      </Text>
      <Text style={styles.muted}>Shared domain wired in ({PlaceType.Castle}).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  body: { fontSize: 16, textAlign: 'center', color: '#333' },
  muted: { fontSize: 13, color: '#888' },
});
