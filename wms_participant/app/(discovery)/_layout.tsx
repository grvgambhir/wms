import { Stack } from 'expo-router';

import { AuthGate } from '@/components/shell/AuthGate';

/** Discovery route group — A03 Events, A04 Event Details, A05 Choose Sport. */
export default function DiscoveryLayout() {
  return (
    <AuthGate>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthGate>
  );
}
