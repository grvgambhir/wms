import { Stack } from 'expo-router';

import { AuthGate } from '@/components/shell/AuthGate';

/** Registration wizard route group — A06–A15. */
export default function RegistrationLayout() {
  return (
    <AuthGate>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthGate>
  );
}
