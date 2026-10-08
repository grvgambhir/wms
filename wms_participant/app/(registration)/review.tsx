import { useRouter } from 'expo-router';
import { Check, Square } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { RegistrationFormLayout } from '@/components/registration/RegistrationFormLayout';
import { RegistrationSummaryCard } from '@/components/registration/RegistrationSummaryCard';
import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { copy } from '@/constants/copy';
import {
  useAthleteDocuments,
  useDocumentRequirements,
} from '@/features/documents/hooks/useDocuments';
import { useAthleteProfile } from '@/features/athlete/hooks/useAthlete';
import {
  useDisciplineCategories,
  useEvent,
  useEventSports,
  useSportDisciplines,
} from '@/features/events/hooks/useEvents';
import {
  useRegistrationFee,
  useSaveRegistrationDraft,
  useSubmitRegistration,
} from '@/features/registration/hooks/useRegistration';
import {
  useRegistrationEventId,
  useRegistrationWizard,
} from '@/features/registration/hooks/useRegistrationWizard';
import { repositories } from '@/data/providers/repositories';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

/** A13 — Review registration + mandatory T&C. */
export default function ReviewScreen() {
  const router = useRouter();
  const { isWideWeb } = useAppLayout();
  const eventId = useRegistrationEventId();
  const { draft, isLoading } = useRegistrationWizard(eventId);
  const { data: profile } = useAthleteProfile();
  const { data: event } = useEvent(eventId);
  const { data: sports } = useEventSports(eventId);
  const { data: disciplines } = useSportDisciplines(draft?.sportId ?? '');
  const { data: categories } = useDisciplineCategories(draft?.disciplineId ?? '');
  const { data: fee } = useRegistrationFee(eventId);
  const { data: documents } = useAthleteDocuments(draft?.athleteId ?? '');
  const { data: requirements } = useDocumentRequirements(eventId);
  const saveDraft = useSaveRegistrationDraft();
  const submitRegistration = useSubmitRegistration();
  const { showToast } = useToast();
  const [termsAccepted, setTermsAccepted] = useState(draft?.termsAccepted ?? false);

  const { data: partner } = useQuery({
    queryKey: ['athlete', 'partner', draft?.partnerAthleteId],
    queryFn: () => repositories.athlete.getProfile(draft!.partnerAthleteId!),
    enabled: Boolean(draft?.partnerAthleteId),
  });

  const sport = sports?.find((item) => item.id === draft?.sportId);
  const discipline = disciplines?.find((item) => item.id === draft?.disciplineId);
  const category = categories?.find((item) => item.id === draft?.categoryId);
  const partnerRequired = category?.partnerRequired ?? false;

  const totalFee = useMemo(() => {
    if (!fee) return 0;
    return fee.entryFee + fee.serviceFee;
  }, [fee]);

  const handleProceed = async () => {
    if (!draft || !eventId || !termsAccepted) return;

    const updatedDraft = {
      ...draft,
      termsAccepted: true,
      currentStep: 6,
      updatedAt: new Date().toISOString(),
    };

    try {
      await saveDraft.mutateAsync(updatedDraft);
      const registration = await submitRegistration.mutateAsync(updatedDraft);
      showToast({
        title: copy.toastRegistrationSubmitted,
        description: copy.toastRegistrationSubmittedBody,
        variant: 'success',
      });
      router.push({
        pathname: '/(registration)/payment',
        params: { eventId, registrationId: registration.id },
      });
    } catch {
      showToast({
        title: copy.toastRegistrationSubmitError,
        description: copy.toastRegistrationSubmitErrorBody,
        variant: 'error',
      });
    }
  };

  if (!eventId) {
    return (
      <AppScreen>
        <ErrorState title="No event selected" />
      </AppScreen>
    );
  }

  if (isLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading review…" />
      </AppScreen>
    );
  }

  if (!draft?.sportId || !draft.disciplineId || !draft.categoryId) {
    return (
      <AppScreen>
        <ErrorState
          title="Registration incomplete"
          description="Finish category, documents, and photo before review."
        />
      </AppScreen>
    );
  }

  if (partnerRequired && !draft.partnerAthleteId) {
    return (
      <AppScreen>
        <ErrorState
          title="Partner required"
          onRetry={() => router.replace({ pathname: '/(registration)/partner-finder', params: { eventId } })}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen className="px-0">
      <RegistrationFormLayout
        currentStep={6}
        header={<AppHeader title={copy.reviewTitle} subtitle={copy.reviewSubtitle} onBack={() => router.back()} />}>
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
          <View className={cn('gap-4', isWideWeb && 'flex-row flex-wrap')}>
            <RegistrationSummaryCard
              className={cn(isWideWeb && 'w-[48%]')}
              title={copy.reviewSectionEvent}
              editLabel={copy.reviewEdit}
              onEdit={() => router.push({ pathname: '/(registration)/category', params: { eventId } })}
              rows={[
                { label: 'Event', value: event?.name ?? '—' },
                { label: 'Sport', value: sport?.name ?? '—' },
                { label: 'Discipline', value: discipline?.name ?? '—' },
                { label: 'Age group', value: category?.ageGroup ?? category?.name ?? '—' },
              ]}
            />

            <RegistrationSummaryCard
              className={cn(isWideWeb && 'w-[48%]')}
              title={copy.reviewSectionAthlete}
              editLabel={copy.reviewEdit}
              onEdit={() => router.push('/(discovery)/account')}
              rows={[
                {
                  label: 'Name',
                  value: profile ? `${profile.firstName} ${profile.lastName}` : '—',
                },
                { label: 'Email', value: profile?.email ?? '—' },
              ]}
            />

            {draft.partnerAthleteId ? (
              <RegistrationSummaryCard
                className={cn(isWideWeb && 'w-[48%]')}
                title={copy.reviewSectionPartner}
                editLabel={copy.reviewEdit}
                onEdit={() => router.push({ pathname: '/(registration)/partner-finder', params: { eventId } })}
                rows={[
                  {
                    label: 'Partner',
                    value: partner ? `${partner.firstName} ${partner.lastName}` : 'Selected',
                  },
                ]}
              />
            ) : null}

            {fee ? (
              <RegistrationSummaryCard
                className={cn(isWideWeb && 'w-[48%]')}
                title={copy.reviewSectionFees}
                rows={[
                  { label: copy.registrationOverviewFee, value: formatMoney(fee.entryFee, fee.currency) },
                  {
                    label: copy.registrationOverviewServiceFee,
                    value: formatMoney(fee.serviceFee, fee.currency),
                  },
                  { label: copy.paymentTotal, value: formatMoney(totalFee, fee.currency) },
                ]}
              />
            ) : null}
          </View>

          {requirements?.length ? (
            <GlassSurface className="gap-3 p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-bold text-foreground">{copy.reviewSectionDocuments}</Text>
                <Pressable onPress={() => router.push({ pathname: '/(registration)/documents', params: { eventId } })}>
                  <Text className="text-sm font-semibold text-primary">
                    {draft.documentIds.length}/{requirements.length}
                  </Text>
                </Pressable>
              </View>
              {requirements.map((requirement) => {
                const doc = documents?.find((item) => item.type === requirement.type);
                const ok = doc?.status === 'uploaded' || doc?.status === 'verified';
                return (
                  <View key={requirement.type} className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-sm text-foreground">{requirement.label}</Text>
                    <Text className={cn('text-sm font-semibold', ok ? 'text-emerald-700' : 'text-muted-foreground')}>
                      {ok ? (doc?.status === 'verified' ? 'Verified' : 'Uploaded') : 'Missing'}
                    </Text>
                  </View>
                );
              })}
            </GlassSurface>
          ) : null}

          <GlassSurface className="p-4">
            <Pressable
              onPress={() => setTermsAccepted((value) => !value)}
              className="flex-row items-start gap-3 hover:opacity-80 active:opacity-80">
              {termsAccepted ? (
                <View className="h-6 w-6 items-center justify-center rounded-md bg-primary">
                  <Check size={16} color="#FFFFFF" />
                </View>
              ) : (
                <Square size={24} color={colors.textMuted} />
              )}
              <Text className="flex-1 text-sm leading-5 text-foreground">
                {copy.reviewTermsPrefix}
                <Text
                  className="font-semibold text-primary underline"
                  onPress={() => Alert.alert(copy.reviewTermsLink, copy.reviewTermsStub)}>
                  {copy.reviewTermsLink}
                </Text>
                {copy.reviewTermsSuffix}
              </Text>
            </Pressable>
            {!termsAccepted ? (
              <Text className="mt-2 text-xs text-muted-foreground">{copy.reviewTermsRequired}</Text>
            ) : null}
          </GlassSurface>
        </ScrollView>
      </RegistrationFormLayout>

      <BottomActionBar constrain>
        <GradientButton
          className="w-full"
          disabled={!termsAccepted || submitRegistration.isPending || saveDraft.isPending}
          onPress={handleProceed}>
          {submitRegistration.isPending ? copy.reviewSubmitting : copy.reviewProceedPayment}
        </GradientButton>
      </BottomActionBar>
    </AppScreen>
  );
}
