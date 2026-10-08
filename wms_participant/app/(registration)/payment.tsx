import { useLocalSearchParams, useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useMemo } from 'react';
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
import { useProcessPayment } from '@/features/payment/hooks/usePayment';
import {
  useDisciplineCategories,
  useEvent,
  useEventSports,
  useSportDisciplines,
} from '@/features/events/hooks/useEvents';
import {
  useRegistrationByEvent,
  useRegistrationFee,
  useUpdateRegistrationStatus,
} from '@/features/registration/hooks/useRegistration';
import {
  useRegistrationEventId,
  useRegistrationWizard,
} from '@/features/registration/hooks/useRegistrationWizard';
import { useAppLayout } from '@/hooks/useAppLayout';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A14 — Mock payment: amount + one Pay CTA (no methods or promo). */
export default function PaymentScreen() {
  const router = useRouter();
  const { isWideWeb } = useAppLayout();
  const eventId = useRegistrationEventId();
  const { registrationId } = useLocalSearchParams<{ registrationId?: string }>();
  const { draft, isLoading: draftLoading } = useRegistrationWizard(eventId);
  const athleteId = draft?.athleteId ?? '';
  const { data: registration, isLoading: registrationLoading } = useRegistrationByEvent(eventId, athleteId);
  const { data: fee, isLoading: feeLoading } = useRegistrationFee(eventId);
  const { data: event } = useEvent(eventId);
  const { data: sports } = useEventSports(eventId);
  const { data: disciplines } = useSportDisciplines(draft?.sportId ?? '');
  const { data: categories } = useDisciplineCategories(draft?.disciplineId ?? '');
  const processPayment = useProcessPayment();
  const updateStatus = useUpdateRegistrationStatus();
  const { showToast } = useToast();

  const resolvedRegistrationId = registrationId ?? registration?.id ?? '';
  const sport = sports?.find((item) => item.id === draft?.sportId);
  const discipline = disciplines?.find((item) => item.id === draft?.disciplineId);
  const category = categories?.find((item) => item.id === draft?.categoryId);
  const sportLine = [sport?.name, discipline?.name, category?.ageGroup].filter(Boolean).join(' · ');

  const pricing = useMemo(() => {
    if (!fee) return null;
    const total = fee.entryFee + fee.serviceFee;
    return {
      total,
      currency: fee.currency,
    };
  }, [fee]);

  const handlePay = async () => {
    if (!resolvedRegistrationId || !eventId || !pricing) return;

    try {
      const result = await processPayment.mutateAsync({
        registrationId: resolvedRegistrationId,
        eventId,
        amount: pricing.total,
        currency: pricing.currency,
        method: 'card',
      });

      if (result.success) {
        await updateStatus.mutateAsync({ id: resolvedRegistrationId, status: 'approved' });
        showToast({
          title: copy.toastPaymentSuccess,
          description: copy.toastPaymentSuccessBody,
          variant: 'success',
        });
        router.replace({
          pathname: '/(registration)/status',
          params: { eventId },
        });
      } else {
        showToast({
          title: copy.toastPaymentError,
          description: copy.toastPaymentErrorBody,
          variant: 'error',
        });
      }
    } catch {
      showToast({
        title: copy.toastPaymentError,
        description: copy.toastPaymentErrorBody,
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

  if (draftLoading || registrationLoading || feeLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading payment…" />
      </AppScreen>
    );
  }

  if (!registration || !pricing) {
    return (
      <AppScreen>
        <ErrorState
          title="Registration not found"
          description="Complete review and submit your registration before payment."
          onRetry={() => router.replace({ pathname: '/(registration)/review', params: { eventId } })}
        />
      </AppScreen>
    );
  }

  const payLabel = copy.paymentPaySecurely.replace('{amount}', formatMoney(pricing.total, pricing.currency));

  return (
    <AppScreen className="px-0">
      <RegistrationFormLayout
        currentStep={7}
        header={<AppHeader title={copy.paymentTitle} subtitle={copy.paymentSubtitle} onBack={() => router.back()} />}>
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
          <View className={cn('gap-4', isWideWeb && 'flex-row items-start')}>
            <View className={cn('gap-4', isWideWeb && 'flex-1')}>
              <GlassSurface className="gap-2 p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="text-sm text-muted-foreground">{copy.paymentAmountToPay}</Text>
                  <Text className="text-2xl font-bold text-primary">
                    {formatMoney(pricing.total, pricing.currency)}
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-foreground">{event?.name ?? '—'}</Text>
                {sportLine ? <Text className="text-sm text-muted-foreground">{sportLine}</Text> : null}
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      copy.paymentSummary,
                      `${copy.paymentTotalPayable}: ${formatMoney(pricing.total, pricing.currency)}`,
                    )
                  }
                  className="self-end">
                  <Text className="text-sm font-semibold text-primary">{copy.paymentViewDetails}</Text>
                </Pressable>
              </GlassSurface>
            </View>

            <View className={cn(isWideWeb && 'w-[38%]')}>
              <RegistrationSummaryCard
                title={copy.paymentSummary}
                rows={[{ label: copy.paymentTotalPayable, value: formatMoney(pricing.total, pricing.currency) }]}
              />
            </View>
          </View>
        </ScrollView>
      </RegistrationFormLayout>

      <BottomActionBar constrain>
        <GradientButton
          className="w-full"
          disabled={processPayment.isPending || updateStatus.isPending}
          onPress={handlePay}>
          <View className="flex-row items-center gap-2">
            <Lock size={16} color="#FFFFFF" />
            <Text className="text-base font-semibold text-white">
              {processPayment.isPending ? copy.paymentProcessing : payLabel}
            </Text>
          </View>
        </GradientButton>
        <Text className="mt-2 text-center text-[11px] text-muted-foreground">{copy.paymentSslNote}</Text>
      </BottomActionBar>
    </AppScreen>
  );
}
