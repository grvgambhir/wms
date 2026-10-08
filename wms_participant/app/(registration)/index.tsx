import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { RegistrationStatusBadge } from '@/components/registration/RegistrationStatusBadge';
import { AppChrome } from '@/components/shell/AppChrome';
import { AppScreen } from '@/components/shell/AppScreen';
import { EmptyState } from '@/components/shell/EmptyState';
import { LoadingState } from '@/components/shell/LoadingState';
import { PageCtaPanel } from '@/components/shell/PageCtaPanel';
import { ScreenHero } from '@/components/shell/ScreenHero';
import { SplitPageLayout } from '@/components/shell/SplitPageLayout';
import { WebPageLayout } from '@/components/shell/WebPageLayout';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { DEMO_IDS } from '@/constants/demo';
import { copy } from '@/constants/copy';
import { CARD_HOVER } from '@/constants/layout';
import { useAuthSession } from '@/features/auth/hooks/useAuth';
import { useEvent } from '@/features/events/hooks/useEvents';
import {
  useRegistrationByEvent,
  useRegistrationDraft,
} from '@/features/registration/hooks/useRegistration';
import { formatEventDateRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

/** Registrations hub — entry from bottom nav / top header Registrations tab. */
export default function RegistrationsHubScreen() {
  const router = useRouter();
  const { data: session } = useAuthSession();
  const athleteId = session?.athleteId ?? '';
  /** Demo event is only used to label an active draft/registration row — not as a catalog tile. */
  const eventId = DEMO_IDS.eventDemo;

  const { data: event, isLoading: eventLoading } = useEvent(eventId);
  const { data: draft, isLoading: draftLoading } = useRegistrationDraft(eventId);
  const { data: registration, isLoading: registrationLoading } = useRegistrationByEvent(eventId, athleteId);

  const isLoading = eventLoading || draftLoading || registrationLoading;
  const hasDraft = Boolean(draft?.sportId);
  const hasRegistration = Boolean(registration);

  const continuePath = hasRegistration
    ? { pathname: '/(registration)/status' as const, params: { eventId } }
    : hasDraft
      ? { pathname: '/(registration)/overview' as const, params: { eventId } }
      : null;

  const openEvents = () => router.push('/(discovery)/events');

  if (isLoading) {
    return (
      <AppScreen>
        <LoadingState message={copy.registrationsHubLoading} />
      </AppScreen>
    );
  }

  return (
    <AppScreen className="px-0">
      <AppChrome active="registrations">
        <WebPageLayout>
          <ScrollView contentContainerClassName="gap-4 pb-6" showsVerticalScrollIndicator={false}>
            <ScreenHero
              eyebrow={copy.appName}
              title={copy.registrationsHubTitle}
              subtitle={copy.registrationsHubSubtitle}
            />

            {!hasDraft && !hasRegistration ? (
              <EmptyState
                title={copy.registrationsHubEmpty}
                description={copy.registrationsHubEmptyHint}
                tone="inbox"
                action={
                  <GradientButton className="w-full" onPress={openEvents}>
                    {copy.registrationsHubBrowseEvents}
                  </GradientButton>
                }
              />
            ) : event ? (
              <SplitPageLayout
                main={
                  <GlassSurface className="gap-3 p-5">
                    <Text className="text-lg font-bold text-foreground lg:text-xl">{event.name}</Text>
                    <Text className="text-sm text-muted-foreground">
                      {formatEventDateRange(event.startDate, event.endDate)} · {event.city}, {event.country}
                    </Text>

                    {registration ? (
                      <View className="flex-row items-center justify-between gap-2 pt-1">
                        <Text className="text-sm font-medium text-foreground">{copy.registrationsHubStatus}</Text>
                        <RegistrationStatusBadge status={registration.status} />
                      </View>
                    ) : (
                      <Text className="text-sm text-muted-foreground">{copy.registrationsHubDraftInProgress}</Text>
                    )}

                    {continuePath ? (
                      <Pressable
                        onPress={() => router.push(continuePath)}
                        className={cn(
                          'mt-2 flex-row items-center justify-between rounded-xl border border-border/60 bg-white px-4 py-3 active:opacity-80',
                          CARD_HOVER,
                        )}>
                        <Text className="text-sm font-semibold text-primary">
                          {hasRegistration ? copy.registrationsHubViewStatus : copy.registrationsHubContinue}
                        </Text>
                        <ChevronRight size={18} color={colors.primary} />
                      </Pressable>
                    ) : null}
                  </GlassSurface>
                }
                rail={
                  <PageCtaPanel
                    title={copy.registrationsHubBrowsePanelTitle}
                    description={copy.registrationsHubBrowsePanelBody}
                    action={
                      <GradientButton className="w-full" onPress={openEvents}>
                        {copy.registrationsHubBrowseEvents}
                      </GradientButton>
                    }
                  />
                }
              />
            ) : null}
          </ScrollView>
        </WebPageLayout>
      </AppChrome>
    </AppScreen>
  );
}
