import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { EventCard } from '@/components/event/EventCard';
import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { LoadingState } from '@/components/shell/LoadingState';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { DEMO_IDS, DEMO_OTP } from '@/constants/demo';
import { resetDemoState } from '@/data/storage/resetDemo';
import { resetRegistrationDemoKeepSession } from '@/data/storage/resetRegistrationDemo';
import { useAuthSession, useVerifyOtp } from '@/features/auth/hooks/useAuth';
import { useEvents } from '@/features/events/hooks/useEvents';
import { useMarcoPartnerDemo } from '@/features/partners/hooks/usePartners';

function formatDateRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt.format(startDate)} – ${fmt.format(endDate)}`;
}

/** Dev screen — verifies repositories + hooks without importing fixtures in UI. */
export default function DataSmokeScreen() {
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useEvents();
  const { data: session } = useAuthSession();
  const verifyOtp = useVerifyOtp();
  const { data: marcoResults } = useMarcoPartnerDemo();
  const [status, setStatus] = useState<string | null>(null);

  const handleMockLogin = async () => {
    await verifyOtp.mutateAsync({ identifier: 'daniel.harper@example.com', code: DEMO_OTP });
    setStatus('Mock login OK — session saved');
  };

  const handleReset = async () => {
    await resetDemoState();
    await queryClient.invalidateQueries();
    setStatus('Demo state cleared');
  };

  const handleResetRegistration = async () => {
    await resetRegistrationDemoKeepSession();
    await queryClient.invalidateQueries({ queryKey: ['registration'] });
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
    await queryClient.invalidateQueries({ queryKey: ['partners'] });
    await queryClient.invalidateQueries({ queryKey: ['accreditation'] });
    setStatus('Registration cleared — login kept');
  };

  return (
    <AppScreen>
      <ScrollView className="flex-1" contentContainerClassName="gap-6 pb-8 pt-2" showsVerticalScrollIndicator={false}>
        <AppHeader title="Data layer" subtitle="Phase 2 repository smoke test" />

        <GlassSurface className="gap-3 p-4">
          <Text className="font-semibold text-foreground">Auth session</Text>
          <Text className="text-sm text-muted-foreground">
            {session ? `Logged in as ${session.athleteId}` : 'Not logged in'}
          </Text>
          <View className="gap-2">
            <View className="flex-row gap-2">
              <GradientButton className="flex-1" onPress={handleMockLogin}>
                Mock login
              </GradientButton>
              <GradientButton className="flex-1" onPress={handleReset}>
                Reset demo
              </GradientButton>
            </View>
            <GradientButton className="w-full" onPress={handleResetRegistration}>
              Reset registration
            </GradientButton>
          </View>
          {status ? <Text className="text-sm text-primary">{status}</Text> : null}
        </GlassSurface>

        <GlassSurface className="gap-2 p-4">
          <Text className="font-semibold text-foreground">Partner search (Marco)</Text>
          <Text className="text-sm text-muted-foreground">
            {marcoResults?.map((p) => `${p.firstName} ${p.lastName}`).join(', ') || 'No results'}
          </Text>
        </GlassSurface>

        <View className="gap-3">
          <Text className="text-lg font-bold text-foreground">Events via repository</Text>
          {isLoading ? <LoadingState message="Loading events…" /> : null}
          {events?.map((event) => (
            <EventCard
              key={event.id}
              name={event.name}
              city={event.city}
              country={event.country}
              dateRange={formatDateRange(event.startDate, event.endDate)}
              status={event.status === 'registration_open' ? 'registration_open' : 'registration_closed'}
              onPress={event.id === DEMO_IDS.eventDemo ? () => undefined : undefined}
            />
          ))}
        </View>
      </ScrollView>
    </AppScreen>
  );
}
