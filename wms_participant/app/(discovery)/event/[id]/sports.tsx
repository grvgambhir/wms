import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { SportCategoryChips } from '@/components/event/SportCategoryChips';
import { SportListRow } from '@/components/event/SportListRow';
import { SportSearchBar } from '@/components/event/SportSearchBar';
import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { EmptyState } from '@/components/shell/EmptyState';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { StackWebChrome } from '@/components/shell/StackWebChrome';
import { WebPageLayout } from '@/components/shell/WebPageLayout';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { PAGE_LEAD } from '@/constants/layout';
import { useAuthSession } from '@/features/auth/hooks/useAuth';
import { useEventSports } from '@/features/events/hooks/useEvents';
import { toQuotaStatus } from '@/features/events/utils/eventPresentation';
import {
  matchesSportCategory,
  type SportCategoryFilter,
} from '@/features/events/utils/sportPresentation';
import { useSaveRegistrationDraft } from '@/features/registration/hooks/useRegistration';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

/** A05 — Choose Sport with search, category chips, and mockup list rows. */
export default function ChooseSportScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SportCategoryFilter>('all');
  const { data: sports, isLoading, isError, refetch } = useEventSports(id ?? '');
  const { data: session } = useAuthSession();
  const saveDraft = useSaveRegistrationDraft();
  const { isWideWeb } = useAppLayout();

  const filteredSports = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!sports) return [];

    return sports.filter((sport) => {
      const matchesQuery = !normalized || sport.name.toLowerCase().includes(normalized);
      const matchesCategory = matchesSportCategory(sport.iconKey, sport.name, category);
      return matchesQuery && matchesCategory;
    });
  }, [category, query, sports]);

  const handleSelectSport = async (sportId: string, availability: string) => {
    if (!id || !session || availability === 'closed') return;

    await saveDraft.mutateAsync({
      id: `draft_${id}`,
      athleteId: session.athleteId,
      eventId: id,
      sportId,
      documentIds: [],
      termsAccepted: false,
      currentStep: 1,
      updatedAt: new Date().toISOString(),
    });

    router.push({
      pathname: '/(registration)/overview',
      params: { eventId: id },
    });
  };

  return (
    <AppScreen className="px-0" plain>
      <StackWebChrome active="events">
        <WebPageLayout>
        <AppHeader title={copy.chooseSportTitle} onBack={() => router.back()} />

        <Text className={cn('mb-4', PAGE_LEAD)}>{copy.chooseSportSubtitle}</Text>

        <SportSearchBar value={query} onChange={setQuery} />

        <View className="my-4">
          <SportCategoryChips value={category} onChange={setCategory} />
        </View>

        {isLoading ? <LoadingState message="Loading sports…" /> : null}
        {isError ? <ErrorState onRetry={() => refetch()} /> : null}

        {!isLoading && !isError && filteredSports.length === 0 ? (
          <EmptyState title={copy.chooseSportEmpty} description={copy.chooseSportEmptyHint} tone="search" />
        ) : null}

        <ScrollView className="flex-1" contentContainerClassName="pb-8" showsVerticalScrollIndicator={false}>
          <View className={cn('gap-2', isWideWeb && 'flex-row flex-wrap')}>
            {filteredSports.map((sport) => {
              const isClosed = sport.availability === 'closed';
              return (
                <View key={sport.id} className={cn(isWideWeb && 'w-[49%]')}>
                  <SportListRow
                    name={sport.name}
                    iconKey={sport.iconKey}
                    availability={toQuotaStatus(sport.availability)}
                    onPress={
                      isClosed || saveDraft.isPending
                        ? undefined
                        : () => handleSelectSport(sport.id, sport.availability)
                    }
                  />
                </View>
              );
            })}
          </View>
        </ScrollView>

        {!session ? (
          <View className="mt-2 rounded-xl bg-amber-50 px-3 py-2">
            <Text className="text-xs text-amber-800">{copy.chooseSportSignInRequired}</Text>
          </View>
        ) : null}
        </WebPageLayout>
      </StackWebChrome>
    </AppScreen>
  );
}
