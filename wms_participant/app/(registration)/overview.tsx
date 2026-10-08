import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, Check } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { WmsMark } from '@/components/brand/WmsMark';
import { JourneyStepsList } from '@/components/registration/JourneyStepsList';
import { RegistrationFormLayout } from '@/components/registration/RegistrationFormLayout';
import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { useAthleteProfile } from '@/features/athlete/hooks/useAthlete';
import { isAthleteProfileComplete } from '@/features/athlete/utils/profileForm';
import {
  useDisciplineCategories,
  useEvent,
  useEventSports,
  useSportDisciplines,
} from '@/features/events/hooks/useEvents';
import { formatEventDateRange, formatEventLocationShort, formatMoney } from '@/lib/format';
import {
  useRegistrationDraft,
  useRegistrationFee,
  useSaveRegistrationDraft,
} from '@/features/registration/hooks/useRegistration';
import { useAppLayout } from '@/hooks/useAppLayout';
import { confirmAction } from '@/lib/confirmAction';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

const INCLUSIONS = [
  copy.registrationOverviewIncludeProfile,
  copy.registrationOverviewIncludeDocuments,
  copy.registrationOverviewIncludeAccreditation,
  copy.registrationOverviewIncludeGamesHub,
] as const;

/** A06 — Registration Overview before the wizard begins. */
export default function RegistrationOverviewScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const resolvedEventId = eventId ?? '';

  const { data: draft, isLoading: draftLoading } = useRegistrationDraft(resolvedEventId);
  const { data: event, isLoading: eventLoading } = useEvent(resolvedEventId);
  const { data: sports } = useEventSports(resolvedEventId);
  const { data: disciplines } = useSportDisciplines(draft?.sportId ?? '');
  const { data: categories } = useDisciplineCategories(draft?.disciplineId ?? '');
  const { data: fee, isLoading: feeLoading } = useRegistrationFee(resolvedEventId);
  const { data: profile, isLoading: profileLoading } = useAthleteProfile();
  const saveDraft = useSaveRegistrationDraft();
  const { isWideWeb } = useAppLayout();

  const selectedSport = sports?.find((sport) => sport.id === draft?.sportId);
  const selectedDiscipline = disciplines?.find((item) => item.id === draft?.disciplineId);
  const selectedCategory = categories?.find((item) => item.id === draft?.categoryId);
  const isLoading = draftLoading || eventLoading || feeLoading;
  const totalFee = fee ? fee.entryFee + fee.serviceFee : 0;

  const sportDetail = [selectedDiscipline?.name, selectedCategory?.ageGroup].filter(Boolean).join(' · ');

  const handleStartRegistration = async () => {
    if (!draft || !resolvedEventId) return;

    if (!isAthleteProfileComplete(profile)) {
      confirmAction(
        copy.registrationProfileIncompleteTitle,
        copy.registrationProfileIncompleteBody,
        copy.registrationProfileIncompleteConfirm,
        () => router.push('/(discovery)/account'),
      );
      return;
    }

    await saveDraft.mutateAsync({
      ...draft,
      currentStep: 2,
      updatedAt: new Date().toISOString(),
    });

    router.push({
      pathname: '/(registration)/category',
      params: { eventId: resolvedEventId },
    });
  };

  if (!resolvedEventId) {
    return (
      <AppScreen>
        <ErrorState
          title="No event selected"
          description="Choose a sport from an event to begin registration."
        />
      </AppScreen>
    );
  }

  if (isLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading registration overview…" />
      </AppScreen>
    );
  }

  if (!draft?.sportId || !event || !selectedSport) {
    return (
      <AppScreen>
        <ErrorState
          title="Registration not ready"
          description="Select a sport first, then return to the overview."
          onRetry={() => router.replace(`/(discovery)/event/${resolvedEventId}/sports`)}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen className="px-0">
      <RegistrationFormLayout
        header={
          <AppHeader
            title={copy.registrationOverviewTitle}
            subtitle={copy.registrationOverviewSubtitle}
            onBack={() => router.back()}
          />
        }>
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
          <View className={cn('gap-4', isWideWeb && 'flex-row items-start')}>
            <View className={cn('gap-4', isWideWeb && 'flex-1')}>
              <GlassSurface className="flex-row items-center gap-3 p-4">
                <View className="overflow-hidden rounded-xl bg-slate-950 px-2 py-2">
                  <WmsMark size="sm" />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-base font-bold text-foreground">{event.name}</Text>
                  <Text className="text-sm text-muted-foreground">
                    {formatEventLocationShort(event.city, event.country)}
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <CalendarDays size={14} color={colors.textMuted} />
                    <Text className="text-xs text-muted-foreground">
                      {formatEventDateRange(event.startDate, event.endDate)}
                    </Text>
                  </View>
                </View>
              </GlassSurface>

              <View className="gap-2">
                <Text className="text-sm font-bold text-foreground">{copy.registrationSelectedSport}</Text>
                <GlassSurface className="flex-row items-center gap-3 p-4">
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-emerald-600">
                    <Text className="text-base font-bold text-white">
                      {selectedSport.name.slice(0, 1)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-bold text-foreground">{selectedSport.name}</Text>
                    {sportDetail ? (
                      <Text className="text-sm text-muted-foreground">{sportDetail}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => router.push(`/(discovery)/event/${resolvedEventId}/sports`)}
                    className="active:opacity-70">
                    <Text className="text-sm font-semibold text-primary">{copy.registrationChangeSport}</Text>
                  </Pressable>
                </GlassSurface>
              </View>

              {fee ? (
                <View className="gap-2">
                  <Text className="text-sm font-bold text-foreground">{copy.registrationOverviewFeeSection}</Text>
                  <GlassSurface className="gap-2 p-4">
                    <View className="flex-row justify-between">
                      <Text className="text-sm text-muted-foreground">{copy.registrationOverviewFee}</Text>
                      <Text className="text-sm font-medium text-foreground">
                        {formatMoney(fee.entryFee, fee.currency)}
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-sm text-muted-foreground">{copy.registrationOverviewServiceFee}</Text>
                      <Text className="text-sm font-medium text-foreground">
                        {formatMoney(fee.serviceFee, fee.currency)}
                      </Text>
                    </View>
                    <Separator className="my-1" />
                    <View className="flex-row justify-between">
                      <Text className="text-sm font-bold text-foreground">{copy.registrationOverviewTotal}</Text>
                      <Text className="text-base font-bold text-primary">
                        {formatMoney(totalFee, fee.currency)}
                      </Text>
                    </View>
                  </GlassSurface>
                </View>
              ) : null}
            </View>

            <View className={cn('gap-4', isWideWeb && 'flex-1')}>
              <GlassSurface className="gap-3 p-4">
                <Text className="text-sm font-bold text-foreground">{copy.registrationOverviewIncludes}</Text>
                {INCLUSIONS.map((item) => (
                  <View key={item} className="flex-row items-start gap-2">
                    <Check size={16} color="#16A34A" style={{ marginTop: 2 }} />
                    <Text className="flex-1 text-sm leading-5 text-foreground">{item}</Text>
                  </View>
                ))}
              </GlassSurface>

              <GlassSurface className="p-4">
                <JourneyStepsList nextStep={1} />
              </GlassSurface>
            </View>
          </View>
        </ScrollView>
      </RegistrationFormLayout>

      <BottomActionBar constrain>
        <GradientButton
          className="w-full"
          disabled={saveDraft.isPending || profileLoading}
          onPress={handleStartRegistration}>
          {copy.registrationStart}
        </GradientButton>
      </BottomActionBar>
    </AppScreen>
  );
}