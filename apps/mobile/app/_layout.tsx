import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { EphemeralStateProvider } from '../src/lib/ephemeral-state';
import { MobileSessionProvider } from '../src/lib/session';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <MobileSessionProvider>
        <EphemeralStateProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="place/[id]" />
            <Stack.Screen name="person/[id]" />
            <Stack.Screen name="auth/sign-in" />
            <Stack.Screen name="auth/sign-up" />
            <Stack.Screen name="trail/[slug]" />
          </Stack>
        </EphemeralStateProvider>
      </MobileSessionProvider>
    </SafeAreaProvider>
  );
}
