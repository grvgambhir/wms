import { Stack } from 'expo-router';

import { AuthGate } from '@/components/shell/AuthGate';

/** Event-time main route group — A16–A18. */
export default function MainLayout() {
  return (
    <AuthGate>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthGate>
  );
}
