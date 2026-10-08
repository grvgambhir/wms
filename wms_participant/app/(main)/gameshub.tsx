import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { EventDayInfoCard } from '@/components/gameshub/EventDayInfoCard';
import { GamesHubNextMatchCard } from '@/components/gameshub/GamesHubNextMatchCard';
import { GamesHubQuickAccess } from '@/components/gameshub/GamesHubQuickAccess';
import { GamesHubToolbar } from '@/components/gameshub/GamesHubToolbar';
import { ScheduleCard } from '@/components/gameshub/ScheduleCard';
import { VenueCard } from '@/components/gameshub/VenueCard';
import { AppChrome } from '@/components/shell/AppChrome';
import { AppScreen } from '@/components/shell/AppScreen';
import { EmptyState } from '@/components/shell/EmptyState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ScreenHero } from '@/components/shell/ScreenHero';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { SplitPageLayout } from '@/components/shell/SplitPageLayout';
import { WebPageLayout } from '@/components/shell/WebPageLayout';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { PAGE_TITLE } from '@/constants/layout';
import { DEMO_IDS } from '@/constants/demo';
import { useAthleteProfile } from '@/features/athlete/hooks/useAthlete';
import { useAuthSession } from '@/features/auth/hooks/useAuth';
import { useEvent } from '@/features/events/hooks/useEvents';
import {
  useGamesHubNotifications,
  useGamesHubSchedule,
  useGamesHubVenues,
} from '@/features/gameshub/hooks/useGamesHub';
import { useRegistrationByEvent, useRegistrationDraft } from '@/features/registration/hooks/useRegistration';
import { useRegistrationEventId } from '@/features/registration/hooks/useRegistrationWizard';
import { useMatch } from '@/features/results/hooks/useResults';
import { formatEventLocation } from '@/lib/format';

const NOTIFICATION_LABELS = {
  info: 'Info',
  schedule_change: 'Schedule',
  registration: 'Registration',
  result: 'Result',
  alert: 'Alert',
} as const;

function isGamesHubUnlocked(status: string | undefined): boolean {
  return status === 'approved' || status === 'accreditation_pending' || status === 'accreditation_issued';
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return copy.gamesHubGreetingMorning;
  if (hour < 17) return copy.gamesHubGreetingAfternoon;
  return copy.gamesHubGreetingEvening;
}

function isSameDay(leftIso: string, rightIso: string): boolean {
  return leftIso.slice(0, 10) === rightIso.slice(0, 10);
}

/** A17 — GamesHub event-time home. Locked until the athlete has an approved registration. */
export default function GamesHubScreen() {
  const router = useRouter();
  const eventId = useRegistrationEventId() || DEMO_IDS.eventDemo;
  const { data: session } = useAuthSession();
  const { data: profile } = useAthleteProfile();
  const { data: event } = useEvent(eventId);
  const athleteId = session?.athleteId ?? profile?.id ?? '';

  const { data: draft, isLoading: draftLoading } = useRegistrationDraft(eventId);
  const { data: registration, isLoading: registrationLoading } = useRegistrationByEvent(eventId, athleteId);
  const canOpenGamesHub = isGamesHubUnlocked(registration?.status);

  const { data: schedule, isLoading: scheduleLoading } = useGamesHubSchedule(eventId, athleteId, canOpenGamesHub);
  const { data: venues, isLoading: venuesLoading } = useGamesHubVenues(eventId, canOpenGamesHub);
  const { data: notifications, isLoading: notificationsLoading } = useGamesHubNotifications(
    eventId,
    athleteId,
    canOpenGamesHub,
  );

  const venueById = useMemo(() => {
    const map = new Map<string, string>();
    venues?.forEach((venue) => map.set(venue.id, venue.name));
    return map;
  }, [venues]);

  const nextMatch = schedule?.find((item) => item.type === 'match' && item.matchId);
  const todayKey = nextMatch?.startAt ?? schedule?.[0]?.startAt;
  const todaySchedule =
    (schedule ?? [])
      .filter((item) => todayKey && isSameDay(item.startAt, todayKey))
      .sort((left, right) => left.startAt.localeCompare(right.startAt));
  const { data: nextMatchResult } = useMatch(nextMatch?.matchId ?? '');
  const firstName = profile?.firstName ?? 'Athlete';

  if (draftLoading || registrationLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading GamesHub…" />
      </AppScreen>
    );
  }

  if (!canOpenGamesHub) {
    const hasDraft = Boolean(draft?.sportId);
    const hasRegistration = Boolean(registration);

    return (
      <AppScreen className="px-0">
        <AppChrome active="home">
          <WebPageLayout>
            <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
              <ScreenHero
                eyebrow={copy.gamesHubLockedEyebrow}
                title={`${copy.gamesHubLockedGreeting}, ${firstName}`}
                subtitle={copy.gamesHubLockedHeroSubtitle}
              />
              <EmptyState
                title={copy.gamesHubLockedTitle}
                description={hasRegistration || hasDraft ? copy.gamesHubLockedInReviewBody : copy.gamesHubLockedBody}
                tone="lock"
                action={
                  hasRegistration ? (
                    <GradientButton
                      className="w-full"
                      onPress={() => router.push({ pathname: '/(registration)/status', params: { eventId } })}>
                      {copy.registrationsHubViewStatus}
                    </GradientButton>
                  ) : hasDraft ? (
                    <GradientButton
                      className="w-full"
                      onPress={() => router.push({ pathname: '/(registration)/overview', params: { eventId } })}>
                      {copy.registrationsHubContinue}
                    </GradientButton>
                  ) : (
                    <GradientButton className="w-full" onPress={() => router.push('/(discovery)/events')}>
                      {copy.registrationsHubBrowseEvents}
                    </GradientButton>
                  )
                }
              />
            </ScrollView>
          </WebPageLayout>
        </AppChrome>
      </AppScreen>
    );
  }

  if (scheduleLoading || venuesLoading || notificationsLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading GamesHub…" />
      </AppScreen>
    );
  }

  if (!schedule?.length) {
    return (
      <AppScreen className="px-0">
        <AppChrome active="home">
          <WebPageLayout>
            <EmptyState
              title={copy.gamesHubScheduleEmpty}
              description={copy.gamesHubScheduleEmptyHint}
              tone="calendar"
            />
          </WebPageLayout>
        </AppChrome>
      </AppScreen>
    );
  }

  const locationLabel = event
    ? formatEventLocation(event.city, event.country, event.state)
    : 'Kansai, Japan';

  const handleQuickAccess = (id: 'schedule' | 'results' | 'venues' | 'pass' | 'medals' | 'favourites') => {
    if (id === 'pass') {
      router.push({ pathname: '/(main)/accreditation', params: { eventId } });
      return;
    }
    if (id === 'results' && nextMatch?.matchId) {
      router.push({ pathname: '/(main)/match/[id]', params: { id: nextMatch.matchId } });
      return;
    }
    if (id === 'schedule' || id === 'venues') {
      return;
    }
    Alert.alert(copy.gamesHubComingSoon, copy.notificationsStub);
  };

  const nextMatchCard = nextMatch ? (
    <GamesHubNextMatchCard
      item={nextMatch}
      match={nextMatchResult}
      venueName={nextMatch.venueId ? venueById.get(nextMatch.venueId) : undefined}
      onPress={() =>
        router.push({
          pathname: '/(main)/match/[id]',
          params: { id: nextMatch.matchId ?? DEMO_IDS.matchTennisDemo },
        })
      }
    />
  ) : null;

  return (
    <AppScreen className="px-0">
      <AppChrome active="home">
        <WebPageLayout>
          <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-6" showsVerticalScrollIndicator={false}>
            <GamesHubToolbar />

            <View>
              <Text className={PAGE_TITLE}>
                {timeOfDayGreeting()}, {firstName}!
              </Text>
              <Text className="mt-1 text-sm text-muted-foreground">{copy.gamesHubGreetingReady}</Text>
            </View>

            <SplitPageLayout
              main={nextMatchCard}
              rail={<GamesHubQuickAccess variant="rail" onPress={handleQuickAccess} />}
            />

            <SplitPageLayout
              main={
                <View className="gap-2">
                  <SectionHeader title={copy.gamesHubToday} />
                  {todaySchedule.map((item) => (
                    <ScheduleCard
                      key={item.id}
                      item={item}
                      venueName={item.venueId ? venueById.get(item.venueId) : undefined}
                    />
                  ))}
                </View>
              }
              rail={
                <>
                  <View className="gap-2">
                    <SectionHeader title={copy.gamesHubAnnouncements} />
                    {notifications?.map((notification) => (
                      <GlassSurface key={notification.id} className="gap-2 p-4">
                        <View className="flex-row items-center justify-between gap-2">
                          <Text className="flex-1 text-sm font-semibold text-foreground">{notification.title}</Text>
                          <View className="rounded-full bg-primary/10 px-2 py-0.5">
                            <Text className="text-[10px] font-bold uppercase text-primary">
                              {NOTIFICATION_LABELS[notification.type]}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-sm text-muted-foreground">{notification.body}</Text>
                      </GlassSurface>
                    ))}
                  </View>
                  <View className="gap-2">
                    <SectionHeader title={copy.gamesHubVenues} />
                    {venues?.map((venue) => (
                      <VenueCard key={venue.id} venue={venue} />
                    ))}
                  </View>
                </>
              }
            />

            <EventDayInfoCard
              eventName={event?.name ?? 'WMG Kansai 2027'}
              locationLabel={locationLabel}
              onPress={() => Alert.alert(copy.gamesHubWeatherStub, copy.notificationsStub)}
            />
          </ScrollView>
        </WebPageLayout>
      </AppChrome>
    </AppScreen>
  );
}
