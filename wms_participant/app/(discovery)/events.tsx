import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { EventFilterTabs, type EventListTab } from '@/components/event/EventFilterTabs';
import { EventsScreenHeader } from '@/components/event/EventsScreenHeader';
import { FeaturedEventCard } from '@/components/event/FeaturedEventCard';
import { PreviousEventTile } from '@/components/event/PreviousEventTile';
import { WorldMastersEventCard } from '@/components/event/WorldMastersEventCard';
import { AppChrome } from '@/components/shell/AppChrome';
import { AppScreen } from '@/components/shell/AppScreen';
import { EmptyState } from '@/components/shell/EmptyState';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { SectionHeader } from '@/components/shell/SectionHeader';
import { WebPageLayout } from '@/components/shell/WebPageLayout';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { gridItemClass, PAGE_LEAD } from '@/constants/layout';
import { useAuthSession } from '@/features/auth/hooks/useAuth';
import { useEvents } from '@/features/events/hooks/useEvents';
import { useRegisteredEventIds } from '@/features/registration/hooks/useRegistration';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

/** A03 — Events discovery (WMS catalog from context_docs/event-details). */
export default function EventsScreen() {
  const router = useRouter();
  const { isWideWeb, contentColumns } = useAppLayout();
  const [tab, setTab] = useState<EventListTab>('all');
  const { data: events, isLoading, isError, refetch } = useEvents();
  const { data: session } = useAuthSession();
  const athleteId = session?.athleteId ?? '';

  const eventIds = useMemo(() => events?.map((event) => event.id) ?? [], [events]);
  const { data: registeredEventIds = [] } = useRegisteredEventIds(eventIds, athleteId);

  const featured = events?.filter((event) => event.featured) ?? [];
  const upcoming = events?.filter((event) => event.listingSection === 'upcoming' && !event.featured) ?? [];
  const previous = events?.filter((event) => event.listingSection === 'previous') ?? [];

  const filterRegistered = <T extends { id: string }>(list: T[]) =>
    tab === 'registered' ? list.filter((item) => registeredEventIds.includes(item.id)) : list;

  const visibleFeatured = filterRegistered(featured);
  const visibleUpcoming = filterRegistered(upcoming);
  const visiblePrevious = filterRegistered(previous);

  const openEvent = (eventId: string) => router.push(`/(discovery)/event/${eventId}`);
  const cardWidthClass = gridItemClass(isWideWeb ? contentColumns : 1);

  if (isLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading events…" />
      </AppScreen>
    );
  }

  if (isError) {
    return (
      <AppScreen>
        <ErrorState onRetry={() => refetch()} />
      </AppScreen>
    );
  }

  if (!events?.length) {
    return (
      <AppScreen className="px-0">
        <AppChrome active="events">
          <WebPageLayout>
            <EmptyState title={copy.eventsEmpty} description={copy.eventsEmptyHint} tone="calendar" />
          </WebPageLayout>
        </AppChrome>
      </AppScreen>
    );
  }

  const showEmptyRegistered =
    tab === 'registered' &&
    visibleFeatured.length === 0 &&
    visibleUpcoming.length === 0 &&
    visiblePrevious.length === 0;

  return (
    <AppScreen className="px-0">
      <AppChrome active="events">
        <WebPageLayout>
          <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
            <EventsScreenHeader />

            <Text className={PAGE_LEAD}>{copy.eventsIntro}</Text>

            <EventFilterTabs value={tab} onChange={setTab} />

            {showEmptyRegistered ? (
              <EmptyState
                title={copy.eventsRegisteredEmpty}
                description={copy.eventsRegisteredEmptyHint}
                tone="inbox"
                action={
                  <GradientButton className="w-full" onPress={() => setTab('all')}>
                    {copy.registrationsHubBrowseEvents}
                  </GradientButton>
                }
              />
            ) : null}

            {visibleFeatured.length > 0 ? (
              <View className={cn('gap-3', isWideWeb && 'flex-row flex-wrap justify-between')}>
                {visibleFeatured.map((event) => (
                  <FeaturedEventCard
                    key={event.id}
                    event={event}
                    onPress={() => openEvent(event.id)}
                    className={cardWidthClass}
                  />
                ))}
              </View>
            ) : null}

            {visibleUpcoming.length > 0 ? (
              <View className="gap-3">
                <SectionHeader title={copy.eventsUpcoming} />
                <View className={cn('gap-3', isWideWeb && 'flex-row flex-wrap justify-between')}>
                  {visibleUpcoming.map((event) => (
                    <WorldMastersEventCard
                      key={event.id}
                      event={event}
                      onPress={() => openEvent(event.id)}
                      className={cardWidthClass}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {visiblePrevious.length > 0 ? (
              <View className="gap-3">
                <SectionHeader title={copy.eventsPrevious} />
                {isWideWeb ? (
                  <View className="flex-row flex-wrap gap-3">
                    {visiblePrevious.map((event) => (
                      <PreviousEventTile key={event.id} event={event} onPress={() => openEvent(event.id)} />
                    ))}
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="pr-4">
                    {visiblePrevious.map((event) => (
                      <PreviousEventTile key={event.id} event={event} onPress={() => openEvent(event.id)} />
                    ))}
                  </ScrollView>
                )}
              </View>
            ) : null}
          </ScrollView>
        </WebPageLayout>
      </AppChrome>
    </AppScreen>
  );
}
