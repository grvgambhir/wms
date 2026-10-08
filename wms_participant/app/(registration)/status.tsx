import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { RegistrationStatusBadge } from '@/components/registration/RegistrationStatusBadge';
import { RegistrationFormLayout } from '@/components/registration/RegistrationFormLayout';
import { RegistrationTimeline } from '@/components/registration/RegistrationTimeline';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ScreenHero } from '@/components/shell/ScreenHero';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { useHiddenRegistrationResetGesture } from '@/features/demo/hooks/useResetRegistrationDemo';
import { useEvent } from '@/features/events/hooks/useEvents';
import { useRegistrationByEvent } from '@/features/registration/hooks/useRegistration';
import {
  useRegistrationEventId,
  useRegistrationWizard,
} from '@/features/registration/hooks/useRegistrationWizard';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

/** A15 — Registration status after payment/submission. */
export default function RegistrationStatusScreen() {
  const router = useRouter();
  const eventId = useRegistrationEventId();
  const { draft, isLoading: draftLoading } = useRegistrationWizard(eventId);
  const athleteId = draft?.athleteId ?? '';
  const { data: registration, isLoading: registrationLoading } = useRegistrationByEvent(eventId, athleteId);
  const { data: event } = useEvent(eventId);
  const handleHiddenResetGesture = useHiddenRegistrationResetGesture();
  const { isWideWeb } = useAppLayout();

  const isApproved =
    registration?.status === 'approved' ||
    registration?.status === 'accreditation_pending' ||
    registration?.status === 'accreditation_issued';

  if (!eventId) {
    return (
      <AppScreen>
        <ErrorState title="No event selected" />
      </AppScreen>
    );
  }

  if (draftLoading || registrationLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading status…" />
      </AppScreen>
    );
  }

  if (!registration) {
    return (
      <AppScreen>
        <ErrorState
          title="No registration found"
          description="Submit your registration and complete payment to see status here."
          onRetry={() => router.replace({ pathname: '/(registration)/review', params: { eventId } })}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen className="px-0">
      <RegistrationFormLayout>
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
          <ScreenHero
            eyebrow={copy.statusTitle}
            title={event?.shortName ?? event?.name ?? 'Your registration'}
            subtitle={isApproved ? copy.statusApprovedBody : copy.statusPendingBody}
            onBack={() => router.back()}
            footer={<RegistrationStatusBadge status={registration.status} />}
          />

          <View className={cn('gap-4', isWideWeb && 'flex-row items-start')}>
            <View className={cn('gap-2', isWideWeb && 'flex-1')}>
              <SectionHeader title={copy.statusTimeline} />
              {/* Hidden tester reset: tap the reference 5 times — not a product cancel CTA */}
              <Pressable onPress={handleHiddenResetGesture} accessibilityRole="text">
                <Text className="text-xs text-muted-foreground">
                  {copy.statusReference}: {registration.id}
                </Text>
              </Pressable>
              <RegistrationTimeline currentStatus={registration.status} />
            </View>
            {isWideWeb ? (
              <GlassSurface className="w-[32%] gap-2 p-4">
                <Text className="text-sm font-bold text-foreground">
                  {isApproved ? copy.statusApprovedBody : copy.statusPendingBody}
                </Text>
                {isApproved ? (
                  <Text className="text-xs text-muted-foreground">{copy.statusViewAccreditation}</Text>
                ) : null}
              </GlassSurface>
            ) : null}
          </View>
        </ScrollView>
      </RegistrationFormLayout>

      {isApproved ? (
        <BottomActionBar constrain>
          <GradientButton
            className="w-full"
            onPress={() =>
              router.push({
                pathname: '/(main)/accreditation',
                params: { eventId, registrationId: registration.id },
              })
            }>
            {copy.statusViewAccreditation}
          </GradientButton>
        </BottomActionBar>
      ) : null}
    </AppScreen>
  );
}
