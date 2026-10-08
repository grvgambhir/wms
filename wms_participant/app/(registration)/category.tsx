import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { OptionTile } from '@/components/registration/OptionTile';
import { QuotaBadge } from '@/components/registration/QuotaBadge';
import { RegistrationFormLayout } from '@/components/registration/RegistrationFormLayout';
import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { EmptyState } from '@/components/shell/EmptyState';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { copy } from '@/constants/copy';
import { useAthleteProfile } from '@/features/athlete/hooks/useAthlete';
import { useEvent, useSport, useSportDisciplines, useDisciplineCategories } from '@/features/events/hooks/useEvents';
import { useSaveRegistrationDraft } from '@/features/registration/hooks/useRegistration';
import {
  useRegistrationEventId,
  useRegistrationWizard,
} from '@/features/registration/hooks/useRegistrationWizard';
import {
  ageOnDate,
  entryTypesForAgeGroup,
  findCategoryBySelection,
  uniqueAgeGroups,
} from '@/features/registration/utils/categorySelection';
import type { CompetitionCategory } from '@/domain/models/sport';
import { gridItemClass } from '@/constants/layout';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

const ENTRY_TYPES: Array<{
  id: NonNullable<CompetitionCategory['entryType']>;
  title: string;
  subtitle: string;
}> = [
  { id: 'competitive', title: copy.categoryEntryCompetitive, subtitle: copy.categoryEntryCompetitiveHint },
  { id: 'recreational', title: copy.categoryEntryRecreational, subtitle: copy.categoryEntryRecreationalHint },
];

/** A08 — Sport & Category (mockup: discipline / age / entry tiles). */
export default function SportCategoryScreen() {
  const router = useRouter();
  const eventId = useRegistrationEventId();
  const { draft, isLoading } = useRegistrationWizard(eventId);
  const sportId = draft?.sportId ?? '';
  const { data: event } = useEvent(eventId);
  const { data: profile } = useAthleteProfile();
  const { data: sport } = useSport(sportId);
  const { data: disciplines, isLoading: disciplinesLoading } = useSportDisciplines(sportId);
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<string | null>(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string | null>(null);
  const [selectedEntryType, setSelectedEntryType] = useState<CompetitionCategory['entryType']>();
  const { data: categories, isLoading: categoriesLoading } = useDisciplineCategories(
    selectedDisciplineId ?? '',
  );
  const saveDraft = useSaveRegistrationDraft();
  const { showToast } = useToast();
  const { isWideWeb } = useAppLayout();

  const ageGroups = useMemo(() => uniqueAgeGroups(categories ?? []), [categories]);
  const offeredEntryTypes = useMemo(
    () => (selectedAgeGroup ? entryTypesForAgeGroup(categories ?? [], selectedAgeGroup) : []),
    [categories, selectedAgeGroup],
  );
  const resolvedCategory = useMemo(() => {
    if (!categories || !selectedAgeGroup) return undefined;
    return findCategoryBySelection(categories, selectedAgeGroup, selectedEntryType);
  }, [categories, selectedAgeGroup, selectedEntryType]);

  const athleteAge = profile?.dateOfBirth
    ? ageOnDate(profile.dateOfBirth, event?.startDate ?? new Date().toISOString())
    : null;

  useEffect(() => {
    if (draft?.disciplineId) setSelectedDisciplineId(draft.disciplineId);
  }, [draft?.disciplineId]);

  useEffect(() => {
    if (!draft?.categoryId || !categories?.length) return;
    const saved = categories.find((category) => category.id === draft.categoryId);
    if (!saved) return;
    setSelectedAgeGroup(saved.ageGroup);
    setSelectedEntryType(saved.entryType);
  }, [categories, draft?.categoryId]);

  useEffect(() => {
    if (!selectedAgeGroup || !offeredEntryTypes.length) return;
    if (selectedEntryType && offeredEntryTypes.includes(selectedEntryType)) return;
    setSelectedEntryType(offeredEntryTypes[0]);
  }, [offeredEntryTypes, selectedAgeGroup, selectedEntryType]);

  const persistDraft = async (nextStep: number) => {
    if (!draft || !eventId || !selectedDisciplineId || !resolvedCategory) return;
    await saveDraft.mutateAsync({
      ...draft,
      disciplineId: selectedDisciplineId,
      categoryId: resolvedCategory.id,
      currentStep: nextStep,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleContinue = async () => {
    await persistDraft(3);
    router.push({ pathname: '/(registration)/documents', params: { eventId } });
  };

  const handleSaveAndExit = async () => {
    await persistDraft(2);
    showToast({
      title: copy.toastDraftSaved,
      description: copy.toastDraftSavedBody,
      variant: 'info',
    });
    router.replace({ pathname: '/(registration)', params: {} });
  };

  if (!eventId) {
    return (
      <AppScreen>
        <ErrorState title="No event selected" />
      </AppScreen>
    );
  }

  if (isLoading || disciplinesLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading categories…" />
      </AppScreen>
    );
  }

  if (!draft?.sportId) {
    return (
      <AppScreen>
        <ErrorState
          title="Sport not selected"
          onRetry={() => router.replace(`/(discovery)/event/${eventId}/sports`)}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen className="px-0">
      <RegistrationFormLayout
        currentStep={2}
        header={
          <AppHeader title={copy.categoryTitle} subtitle={copy.categorySubtitle} onBack={() => router.back()} />
        }>
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
          <GlassSurface className="flex-row items-center gap-3 bg-emerald-50 p-4">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-emerald-600">
              <Text className="text-lg font-bold text-white">T</Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                {copy.categorySelectedSport}
              </Text>
              <Text className="text-base font-bold text-foreground">{sport?.name ?? 'Sport'}</Text>
            </View>
          </GlassSurface>

          <View className="gap-2">
            <Text className="text-sm font-bold text-foreground">{copy.categoryDiscipline}</Text>
            {!disciplines?.length ? (
              <EmptyState title={copy.categoryEmpty} description={copy.categoryEmptyHint} tone="folder" />
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              {disciplines?.map((discipline) => (
                <OptionTile
                  key={discipline.id}
                  className={gridItemClass(3)}
                  title={discipline.name}
                  selected={selectedDisciplineId === discipline.id}
                  onPress={() => {
                    setSelectedDisciplineId(discipline.id);
                    setSelectedAgeGroup(null);
                    setSelectedEntryType(undefined);
                  }}
                />
              ))}
            </View>
          </View>

          {selectedDisciplineId ? (
            <View className="gap-2">
              <Text className="text-sm font-bold text-foreground">{copy.categoryAgeGroup}</Text>
              {athleteAge != null ? (
                <Text className="text-xs text-muted-foreground">
                  {copy.categoryAgeHintPrefix} {athleteAge}
                </Text>
              ) : null}
              {categoriesLoading ? <LoadingState message="Loading categories…" /> : null}
              <View className="flex-row flex-wrap gap-2">
                {ageGroups.map((group) => (
                  <OptionTile
                    key={group}
                    className={gridItemClass(3)}
                    title={group}
                    selected={selectedAgeGroup === group}
                    onPress={() => setSelectedAgeGroup(group)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {selectedAgeGroup ? (
            <View className="gap-2">
              <Text className="text-sm font-bold text-foreground">{copy.categoryEntryType}</Text>
              <View className={cn('gap-2', isWideWeb && 'flex-row flex-wrap justify-between')}>
                {ENTRY_TYPES.map((entry) => (
                  <OptionTile
                    key={entry.id}
                    className={isWideWeb ? gridItemClass(2) : 'w-full'}
                    title={entry.title}
                    subtitle={entry.subtitle}
                    selected={selectedEntryType === entry.id}
                    disabled={!offeredEntryTypes.includes(entry.id)}
                    onPress={() => setSelectedEntryType(entry.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {resolvedCategory?.quotaStatus ? (
            <QuotaBadge status={resolvedCategory.quotaStatus} />
          ) : null}
          {resolvedCategory?.partnerRequired ? (
            <Text className="text-xs text-muted-foreground">{copy.categoryPartnerRequired}</Text>
          ) : null}
        </ScrollView>
      </RegistrationFormLayout>

      <BottomActionBar constrain>
        <GradientButton
          className="w-full"
          disabled={!resolvedCategory || saveDraft.isPending}
          onPress={handleContinue}>
          {copy.saveAndContinue}
        </GradientButton>
        <Pressable
          onPress={handleSaveAndExit}
          disabled={!resolvedCategory || saveDraft.isPending}
          className="items-center py-2 active:opacity-70">
          <Text className={cn('text-sm font-semibold text-primary', !resolvedCategory && 'opacity-40')}>
            {copy.saveAndExit}
          </Text>
        </Pressable>
      </BottomActionBar>
    </AppScreen>
  );
}