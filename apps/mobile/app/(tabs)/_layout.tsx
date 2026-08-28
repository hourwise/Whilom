import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useMobileTheme } from '../../src/theme';

const tabIcons: Record<string, string> = {
  discover: '⌖',
  saved: '♡',
  trips: '⌁',
  profile: '◉',
};

export default function TabsLayout() {
  const theme = useMobileTheme();
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: theme.colors.accent,
      tabBarInactiveTintColor: theme.colors.textFaint,
      tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, height: 78, paddingTop: 8, paddingBottom: 12 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>{tabIcons[route.name] ?? '·'}</Text>,
    })}>
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved' }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
