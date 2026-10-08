// Participant portal route group (Como 2027). Screens wrap themselves in
// ParticipantPortalShell for now; a shared _layout Slot comes when several
// participant screens exist (WS-C).
import { Stack } from 'expo-router';

import { AuthGate } from '@/components/shell/AuthGate';
import { RegistrationJourneyProvider } from '@/features/registration/RegistrationJourneyContext';

export default function ParticipantLayout() {
  return (
    <AuthGate>
      <RegistrationJourneyProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </RegistrationJourneyProvider>
    </AuthGate>
  );
}
