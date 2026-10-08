import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Filter, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { PartnerCard } from '@/components/partner/PartnerCard';
import { RegistrationFormLayout } from '@/components/registration/RegistrationFormLayout';
import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { EmptyState } from '@/components/shell/EmptyState';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ResponsiveGrid } from '@/components/shell/ResponsiveGrid';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { DEMO_IDS } from '@/constants/demo';
import { copy } from '@/constants/copy';
import { repositories } from '@/data/providers/repositories';
import type { AthleteSummary } from '@/domain/models/athlete';
import type { PartnerRequest } from '@/domain/models/partner';
import { useDisciplineCategories } from '@/features/events/hooks/useEvents';
import {
  useCancelPendingPartnerRequests,
  usePartnerCandidates,
  usePartnerRequests,
  useSendPartnerRequest,
} from '@/features/partners/hooks/usePartners';
import {
  parsePartnerSetupMode,
} from '@/features/partners/utils/partnerSetup';
import { useSaveRegistrationDraft } from '@/features/registration/hooks/useRegistration';
import {
  useRegistrationEventId,
  useRegistrationWizard,
} from '@/features/registration/hooks/useRegistrationWizard';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

function filterPartnersByQuery(partners: AthleteSummary[], query: string): AthleteSummary[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return partners;

  return partners.filter((partner) => {
    const fullName = `${partner.firstName} ${partner.lastName}`.toLowerCase();
    return fullName.includes(normalized) || partner.nationalityCountryCode.toLowerCase().includes(normalized);
  });
}

/** A12 — Partner Finder. */
export default function PartnerFinderScreen() {
  const router = useRouter();
  const eventId = useRegistrationEventId();
  const { draft, isLoading } = useRegistrationWizard(eventId);
  const { partnerMode: partnerModeParam } = useLocalSearchParams<{ partnerMode?: string }>();
  const partnerMode = parsePartnerSetupMode(partnerModeParam);
  const isKnownPartnerPath = partnerMode === 'have';
  const [query, setQuery] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(draft?.partnerAthleteId ?? null);
  const [countryFilter, setCountryFilter] = useState<string | null>(null);

  const categoryId = draft?.categoryId ?? '';
  const sportId = draft?.sportId ?? '';
  const athleteId = draft?.athleteId ?? '';
  const trimmedQuery = query.trim();

  const { data: categories } = useDisciplineCategories(draft?.disciplineId ?? '');
  const selectedCategory = categories?.find((category) => category.id === categoryId);
  const partnerRequired = selectedCategory?.partnerRequired ?? false;
  const isTennisDoublesDemo = categoryId === DEMO_IDS.categoryTennisMd4044;

  const { data: categoryPartners, isLoading: candidatesLoading } = usePartnerCandidates(
    eventId,
    categoryId,
    sportId,
  );

  const localMatches = useMemo(
    () => filterPartnersByQuery(categoryPartners ?? [], query),
    [categoryPartners, query],
  );

  const { data: sportSearchResults } = useQuery({
    queryKey: ['partners', 'sport-search', eventId, sportId, trimmedQuery],
    queryFn: () =>
      repositories.partners.searchPartners({
        eventId,
        categoryId,
        sportId,
        query: trimmedQuery,
      }),
    enabled: Boolean(eventId && sportId && trimmedQuery.length >= 2 && localMatches.length === 0),
    staleTime: 30_000,
  });

  const visiblePartners = useMemo(() => {
    const base = localMatches.length > 0 ? localMatches : sportSearchResults ?? [];
    if (!countryFilter) return base;
    return base.filter((partner) => partner.nationalityCountryCode === countryFilter);
  }, [countryFilter, localMatches, sportSearchResults]);

  const countryOptions = useMemo(() => {
    const codes = new Set((categoryPartners ?? []).map((partner) => partner.nationalityCountryCode));
    return [...codes].sort();
  }, [categoryPartners]);

  const { data: requests } = usePartnerRequests(eventId, athleteId);
  const sendRequest = useSendPartnerRequest();
  const cancelPending = useCancelPendingPartnerRequests();
  const saveDraft = useSaveRegistrationDraft();
  const { showToast } = useToast();
  const { isWideWeb } = useAppLayout();
  const busy = sendRequest.isPending || cancelPending.isPending || saveDraft.isPending;

  const requestByPartnerId = useMemo(() => {
    const map = new Map<string, PartnerRequest>();
    requests?.forEach((request) => {
      if (request.fromAthleteId === athleteId && request.status !== 'cancelled') {
        map.set(request.toAthleteId, request);
      }
    });
    return map;
  }, [athleteId, requests]);

  const acceptedFromRequest = requests?.find(
    (request) => request.fromAthleteId === athleteId && request.status === 'accepted',
  )?.toAthleteId;
  const acceptedPartnerId = selectedPartnerId ?? acceptedFromRequest ?? null;
  const hasPendingRequest = requests?.some(
    (request) => request.fromAthleteId === athleteId && request.status === 'pending',
  );

  const persistAcceptedPartner = async (toAthleteId: string, immediate = false) => {
    if (!draft) return;
    setSelectedPartnerId(toAthleteId);
    await saveDraft.mutateAsync({
      ...draft,
      partnerAthleteId: toAthleteId,
      updatedAt: new Date().toISOString(),
    });
    showToast({
      title: immediate ? copy.toastPartnerSelected : copy.toastPartnerConfirmed,
      description: immediate ? copy.toastPartnerSelectedBody : copy.toastPartnerConfirmedBody,
      variant: 'success',
    });
  };

  const handleSelectKnownPartner = async (toAthleteId: string) => {
    if (!draft || !eventId || !athleteId) return;
    await cancelPending.mutateAsync({ eventId, fromAthleteId: athleteId, exceptToAthleteId: toAthleteId });
    await persistAcceptedPartner(toAthleteId, true);
  };

  const handleSendRequest = async (toAthleteId: string) => {
    if (!draft || !eventId || !categoryId || !athleteId) return;
    if (requestByPartnerId.get(toAthleteId)?.status === 'pending') return;
    if (acceptedPartnerId) return;

    const request = await sendRequest.mutateAsync({
      eventId,
      categoryId,
      fromAthleteId: athleteId,
      toAthleteId,
    });

    if (request.status === 'accepted') {
      await persistAcceptedPartner(toAthleteId);
      return;
    }

    showToast({
      title: copy.toastPartnerRequestSent,
      description: copy.toastPartnerRequestSentBody,
      variant: 'info',
    });

  };

  const handleContinue = async () => {
    if (!draft || !eventId) return;

    if (!partnerRequired && !acceptedPartnerId) {
      router.push({
        pathname: '/(registration)/review',
        params: { eventId },
      });
      return;
    }

    if (!acceptedPartnerId) return;

    if (!draft.partnerAthleteId) {
      await saveDraft.mutateAsync({
        ...draft,
        partnerAthleteId: acceptedPartnerId,
        updatedAt: new Date().toISOString(),
      });
    }

    router.push({
      pathname: '/(registration)/review',
      params: { eventId },
    });
  };

  if (!eventId) {
    return (
      <AppScreen>
        <ErrorState title="No event selected" />
      </AppScreen>
    );
  }

  if (isLoading || candidatesLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading partners…" />
      </AppScreen>
    );
  }

  if (!draft?.categoryId) {
    return (
      <AppScreen>
        <ErrorState
          title="Category required"
          onRetry={() => router.replace({ pathname: '/(registration)/category', params: { eventId } })}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen className="px-0">
      <RegistrationFormLayout
        currentStep={5}
        header={
          <AppHeader
            title={copy.partnerFinderTitle}
            subtitle={copy.partnerFinderSubtitle}
            onBack={() => router.back()}
          />
        }>
        <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-border bg-white/80 px-3">
          <Search size={16} color={colors.textMuted} />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={copy.partnerFinderSearch}
            className="h-12 flex-1 border-0 bg-transparent"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View className="mb-3 flex-row flex-wrap items-center gap-2">
          {selectedCategory?.ageGroup ? (
            <View className="rounded-full border border-primary bg-primary/10 px-3 py-1.5">
              <Text className="text-xs font-semibold text-primary">
                {copy.partnerFinderFilterAge}: {selectedCategory.ageGroup}
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => setCountryFilter(null)}
            className={cn(
              'rounded-full border px-3 py-1.5',
              !countryFilter ? 'border-primary bg-primary/10' : 'border-border bg-white',
            )}>
            <Text className={cn('text-xs font-semibold', !countryFilter ? 'text-primary' : 'text-foreground')}>
              {copy.partnerFinderFilterAll}
            </Text>
          </Pressable>
          {countryOptions.map((code) => (
            <Pressable
              key={code}
              onPress={() => setCountryFilter(code)}
              className={cn(
                'rounded-full border px-3 py-1.5',
                countryFilter === code ? 'border-primary bg-primary/10' : 'border-border bg-white',
              )}>
              <Text className={cn('text-xs font-semibold', countryFilter === code ? 'text-primary' : 'text-foreground')}>
                {code}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => Alert.alert(copy.partnerFinderFilterCountry, copy.partnerFinderPostStub)}
            className="h-8 w-8 items-center justify-center rounded-full border border-border bg-white">
            <Filter size={14} color={colors.primary} />
          </Pressable>
        </View>

        {!isTennisDoublesDemo && !partnerRequired ? (
          <GlassSurface className="mb-3 p-3">
            <Text className="text-xs leading-5 text-muted-foreground">{copy.partnerFinderWrongSport}</Text>
          </GlassSurface>
        ) : (
          <GlassSurface className="mb-3 bg-emerald-50 p-3">
            <Text className="text-sm font-bold text-emerald-800">
              {visiblePartners.length} {copy.partnerFinderFound}
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {isKnownPartnerPath
                ? copy.partnerFinderHaveHint
                : partnerMode === 'invite'
                  ? copy.partnerFinderInviteHint
                  : copy.partnerFinderFoundHint}
            </Text>
          </GlassSurface>
        )}

        {hasPendingRequest && !acceptedPartnerId ? (
          <GlassSurface className="mb-3 border-amber-200 bg-amber-50 p-3">
            <Text className="text-xs leading-5 text-amber-900">{copy.partnerFinderWaitingBanner}</Text>
          </GlassSurface>
        ) : null}

        <ScrollView className="flex-1" contentContainerClassName="gap-3 pb-4" showsVerticalScrollIndicator={false}>
          {visiblePartners.length === 0 ? (
            <EmptyState
              title={copy.partnerFinderEmpty}
              description={
                trimmedQuery && !isTennisDoublesDemo
                  ? copy.partnerFinderEmptyHint
                  : copy.partnerFinderMarcoHint
              }
              tone="search"
            />
          ) : (
            <ResponsiveGrid columns={isWideWeb ? 2 : 1}>
              {visiblePartners.map((partner) => {
                const request = requestByPartnerId.get(partner.id);
                const isAccepted = request?.status === 'accepted' || acceptedPartnerId === partner.id;
                const canAct = !acceptedPartnerId || isAccepted;

                return (
                  <PartnerCard
                    key={partner.id}
                    partner={partner}
                    selected={acceptedPartnerId === partner.id}
                    requestStatus={request?.status}
                    sending={sendRequest.isPending && sendRequest.variables?.toAthleteId === partner.id}
                    confirmLabel={isKnownPartnerPath ? copy.partnerFinderSelectPartner : undefined}
                    onSendRequest={
                      canAct
                        ? () =>
                            isKnownPartnerPath
                              ? handleSelectKnownPartner(partner.id)
                              : handleSendRequest(partner.id)
                        : undefined
                    }
                    onSelect={isAccepted ? () => setSelectedPartnerId(partner.id) : undefined}
                  />
                );
              })}
            </ResponsiveGrid>
          )}

          <GlassSurface className="mt-2 gap-3 p-4">
            <Text className="text-sm font-bold text-foreground">{copy.partnerFinderPostTitle}</Text>
            <Text className="text-xs leading-5 text-muted-foreground">{copy.partnerFinderPostBody}</Text>
            <Pressable
              onPress={() => Alert.alert(copy.partnerFinderPostCta, copy.partnerFinderPostStub)}
              className="items-center rounded-xl border border-primary py-3 hover:bg-primary/5 active:opacity-80">
              <Text className="text-sm font-semibold text-primary">{copy.partnerFinderPostCta}</Text>
            </Pressable>
          </GlassSurface>
        </ScrollView>
      </RegistrationFormLayout>

      <BottomActionBar constrain>
        <GradientButton
          className="w-full"
          disabled={(partnerRequired && !acceptedPartnerId) || busy}
          onPress={handleContinue}>
          {partnerRequired ? copy.partnerFinderContinue : copy.partnerSkipToReview}
        </GradientButton>
      </BottomActionBar>
    </AppScreen>
  );
}
