import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';

import { AccreditationPassBody } from '@/components/accreditation/AccreditationCard';
import { RegistrationFormLayout } from '@/components/registration/RegistrationFormLayout';
import { AppChrome } from '@/components/shell/AppChrome';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ScreenHero } from '@/components/shell/ScreenHero';
import { GradientButton } from '@/components/ui/gradient-button';
import { copy } from '@/constants/copy';
import { DEMO_IDS } from '@/constants/demo';
import { useAccreditation, useIssueAccreditation } from '@/features/accreditation/hooks/useAccreditation';
import { useAthleteById, useAthleteProfile } from '@/features/athlete/hooks/useAthlete';
import {
  useDisciplineCategories,
  useEvent,
  useEventSports,
  useSportDisciplines,
} from '@/features/events/hooks/useEvents';
import { useRegistrationByEvent } from '@/features/registration/hooks/useRegistration';
import {
  useRegistrationEventId,
  useRegistrationWizard,
} from '@/features/registration/hooks/useRegistrationWizard';
import { formatEventLocationShort } from '@/lib/format';
import { toAssetPhotoRef } from '@/lib/photo';

/** A16 — Digital accreditation pass. */
export default function AccreditationScreen() {
  const router = useRouter();
  const eventId = useRegistrationEventId() || DEMO_IDS.eventDemo;
  const { registrationId: registrationIdParam } = useLocalSearchParams<{ registrationId?: string }>();
  const { draft } = useRegistrationWizard(eventId);
  const athleteId = draft?.athleteId ?? '';
  const { data: registration } = useRegistrationByEvent(eventId, athleteId);
  const registrationId = registrationIdParam ?? registration?.id ?? DEMO_IDS.registrationDemo;

  const { data: profile } = useAthleteProfile();
  const { data: event } = useEvent(eventId);
  const partnerId = draft?.partnerAthleteId ?? registration?.partnerAthleteId ?? '';
  const { data: partner } = useAthleteById(partnerId);
  // Pass copy follows the submitted registration; draft may only have a new sport pick.
  const sportId = registration?.sportId ?? draft?.sportId ?? '';
  const disciplineId = registration?.disciplineId ?? draft?.disciplineId ?? '';
  const categoryId = registration?.categoryId ?? draft?.categoryId ?? '';
  const { data: sports } = useEventSports(eventId);
  const { data: disciplines } = useSportDisciplines(sportId);
  const { data: categories } = useDisciplineCategories(disciplineId);

  const { data: accreditation, isLoading } = useAccreditation(registrationId);
  const issueAccreditation = useIssueAccreditation();

  const registrationStatus = registration?.status;
  const canIssue =
    registrationStatus === 'approved' ||
    registrationStatus === 'accreditation_pending' ||
    registrationStatus === 'accreditation_issued';

  useEffect(() => {
    if (!registrationId || accreditation || issueAccreditation.isPending || issueAccreditation.data) {
      return;
    }
    if (canIssue) {
      issueAccreditation.mutate(registrationId);
    }
  }, [accreditation, canIssue, issueAccreditation, registrationId]);

  const resolvedAccreditation = accreditation ?? issueAccreditation.data;

  const sport = sports?.find((item) => item.id === sportId);
  const discipline = disciplines?.find((item) => item.id === disciplineId);
  const category = categories?.find((item) => item.id === categoryId);

  if (isLoading || issueAccreditation.isPending) {
    return (
      <AppScreen>
        <LoadingState message="Loading accreditation…" />
      </AppScreen>
    );
  }

  if (!resolvedAccreditation || !profile) {
    return (
      <AppScreen>
        <ErrorState
          title="Accreditation unavailable"
          description="Complete registration and payment first."
          onRetry={() => router.replace({ pathname: '/(registration)/status', params: { eventId } })}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen className="px-0">
      <AppChrome
        active="home"
        footer={
          <BottomActionBar flush>
            <GradientButton
              className="w-full"
              onPress={() => router.push({ pathname: '/(main)/gameshub', params: { eventId } })}>
              {copy.accreditationGoGamesHub}
            </GradientButton>
          </BottomActionBar>
        }>
        <RegistrationFormLayout siteNav={false} withGutters={false} className="min-h-0 py-4 lg:py-6">
          <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
            <ScreenHero
              eyebrow={copy.accreditationPassLabel}
              title={copy.accreditationTitle}
              subtitle={copy.accreditationSubtitle}
              onBack={() => router.back()}
            />

            <AccreditationPassBody
              athleteName={`${profile.firstName} ${profile.lastName}`}
              nationalityCountryCode={profile.nationalityCountryCode}
              sportLabel={sport?.name ?? 'Sport'}
              categoryLabel={category?.name ?? discipline?.name ?? 'Category'}
              partnerLabel={partner ? `${partner.firstName} ${partner.lastName}` : undefined}
              eventName={event?.name ?? copy.accreditationTitle}
              eventLocation={event ? formatEventLocationShort(event.city, event.country) : ''}
              photoUri={
                draft?.accreditationPhotoUri ??
                profile.profileImageUri ??
                (profile.profileImageKey ? toAssetPhotoRef(profile.profileImageKey) : undefined)
              }
              accreditation={resolvedAccreditation}
            />
          </ScrollView>
        </RegistrationFormLayout>
      </AppChrome>
    </AppScreen>
  );
}
