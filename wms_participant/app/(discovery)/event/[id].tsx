import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, Clock3, Globe, MapPin, UserRound } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import { EventDetailHero } from '@/components/event/EventDetailHero';
import { EventInfoRow } from '@/components/event/EventInfoRow';
import { EventStatCards } from '@/components/event/EventStatCards';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { StackWebChrome } from '@/components/shell/StackWebChrome';
import { WebPageLayout } from '@/components/shell/WebPageLayout';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { useEvent, useEventSports } from '@/features/events/hooks/useEvents';
import { useAppLayout } from '@/hooks/useAppLayout';
import {
  formatEventDateLong,
  formatEventDeadline,
  formatEventLocationShort,
} from '@/lib/format';
import { colors } from '@/theme/colors';

/** A04 — Event Details (mockup-aligned hero + stats + info rows). */
export default function EventDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isWideWeb } = useAppLayout();
  const { data: event, isLoading, isError, refetch } = useEvent(id ?? '');
  const { data: sports } = useEventSports(id ?? '');

  if (isLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading event…" />
      </AppScreen>
    );
  }

  if (isError || !event) {
    return (
      <AppScreen>
        <ErrorState onRetry={() => refetch()} />
      </AppScreen>
    );
  }

  const canRegisterInApp = Boolean(event.registerable && (sports?.length ?? event.sportIds.length));
  const externalUrl = event.externalUrl ?? event.website;
  const sportStat = event.sportCount ? `${event.sportCount}${String(event.sportCount).includes('+') ? '' : '+'}` : `${sports?.length ?? 0}`;
  const venueLabel = event.venueCount
    ? `${event.venueCount}${String(event.venueCount).includes('+') ? '' : '+'} ${copy.eventDetailsVenuesSuffix} in ${event.city}`
    : undefined;

  const stats = [
    { value: sportStat, label: copy.eventDetailsStatSports },
    { value: event.participantCount ?? '30K+', label: copy.eventDetailsStatParticipants },
    { value: event.countryCount ?? '110+', label: copy.eventDetailsStatCountries },
  ];

  const aboutCopy = event.listingCopy ?? event.description ?? event.heroTagline ?? '';

  const detailBody = (
    <View className="gap-4">
      <Text className="text-2xl font-bold leading-tight text-foreground">{event.name}</Text>

      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <MapPin size={16} color={colors.textMuted} />
          <Text className="text-sm text-muted-foreground">
            {formatEventLocationShort(event.city, event.country)}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <CalendarDays size={16} color={colors.textMuted} />
          <Text className="text-sm text-muted-foreground">
            {formatEventDateLong(event.startDate, event.endDate)}
          </Text>
        </View>
      </View>

      <EventStatCards items={stats} />

      {aboutCopy ? (
        <View className="gap-2">
          <Text className="text-lg font-bold text-foreground">{copy.eventDetailsAbout}</Text>
          <Text className="text-sm leading-6 text-muted-foreground">{aboutCopy}</Text>
        </View>
      ) : null}

      <View className="rounded-2xl border border-border/60 bg-white px-4">
        {event.registrationDeadline ? (
          <EventInfoRow
            icon={<Clock3 size={18} color={colors.primary} />}
            label={copy.eventDetailsRegistrationDeadline}
            value={formatEventDeadline(event.registrationDeadline)}
          />
        ) : null}
        {event.ageGroupLabel ? (
          <EventInfoRow
            icon={<UserRound size={18} color={colors.primary} />}
            label={copy.eventDetailsAgeGroup}
            value={event.ageGroupLabel}
          />
        ) : null}
        {venueLabel ? (
          <EventInfoRow
            icon={<MapPin size={18} color={colors.primary} />}
            label={copy.eventDetailsVenues}
            value={venueLabel}
          />
        ) : null}
        {externalUrl ? (
          <EventInfoRow
            icon={<Globe size={18} color={colors.primary} />}
            label={copy.eventDetailsWebsite}
            value={externalUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            valueClassName="text-sm font-semibold text-primary"
            onPress={() => Linking.openURL(externalUrl)}
          />
        ) : null}
      </View>
    </View>
  );

  const hero = (
    <EventDetailHero
      title={event.name}
      imageKey={event.heroImageKey ?? event.cardImageKey}
      onBack={() => router.back()}
      contained
    />
  );

  const registerCta = canRegisterInApp ? (
    <GradientButton
      className="w-full"
      onPress={() => router.push(`/(discovery)/event/${event.id}/sports`)}>
      {copy.eventDetailsExploreSports}
    </GradientButton>
  ) : externalUrl ? (
    <GradientButton className="w-full" onPress={() => Linking.openURL(externalUrl)}>
      {event.ctaLabel ?? copy.eventDetailsMoreInfo}
    </GradientButton>
  ) : null;

  return (
    <AppScreen className="px-0">
      <StackWebChrome
        active="events"
        footer={!isWideWeb && registerCta ? <BottomActionBar>{registerCta}</BottomActionBar> : undefined}>
        <WebPageLayout>
          <ScrollView className="flex-1" contentContainerClassName="pb-8" showsVerticalScrollIndicator={false}>
            {isWideWeb ? (
              <View className="flex-row items-start gap-8">
                <View className="flex-1">{hero}</View>
                <View className="flex-1 gap-4 pt-4">
                  {detailBody}
                  {registerCta}
                </View>
              </View>
            ) : (
              <View className="gap-6">
                {hero}
                {detailBody}
              </View>
            )}
          </ScrollView>
        </WebPageLayout>
      </StackWebChrome>
    </AppScreen>
  );
}
