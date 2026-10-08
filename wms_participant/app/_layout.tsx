import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AppProviders } from '@/lib/providers';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(discovery)" />
          <Stack.Screen name="(registration)" />
          <Stack.Screen name="(main)" />
          <Stack.Screen name="(participant)" />
          <Stack.Screen name="(dev)" />
        </Stack>
        <PortalHost />
      </AppProviders>
    </SafeAreaProvider>
  );
}
