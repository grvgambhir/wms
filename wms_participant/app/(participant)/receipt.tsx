// P14 — participant payment receipt. Only rendered for a captured/paid order;
// unpaid journeys get an honest empty state (same pattern as the accreditation pass).
import { CheckCircle2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { Text } from '@/components/ui/text';
import { usePaymentReceipt } from '@/features/payment/hooks/usePaymentReceipt';
import type { CapturedPaymentReceipt } from '@/features/payment/receiptView';
import { useCopy, useLocale, type CopyDict } from '@/i18n';
import {
  formatDateTimeInTimeZone,
  formatEventDateRangeInTimeZone,
  formatMoneyMinor,
  intlLocale,
} from '@/lib/format';
import { colors } from '@/theme/colors';

/** One label/value line. Screen reader hears a single phrase ("Total (EUR): €90.00"). */
function ReceiptRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View
      className="flex-row items-start justify-between gap-3 border-b border-border/60 py-2.5"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        aria-hidden
        className="max-w-[48%] flex-1 text-[13px] leading-5 text-muted-foreground"
      >
        {label}
      </Text>
      <Text
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        aria-hidden
        selectable
        className={`min-w-0 max-w-[55%] flex-1 text-right text-[13px] leading-5 text-foreground ${strong ? 'font-extrabold' : 'font-semibold'}`}
      >
        {value}
      </Text>
    </View>
  );
}

export default function PaymentReceiptScreen() {
  const router = useRouter();
  const copy = useCopy();
  const { locale } = useLocale();
  const { receipt, isLoading, isError, error, retry } = usePaymentReceipt();
  const tag = intlLocale(locale);

  if (isLoading) {
    return (
      <ParticipantPortalShell activeId="payments">
        <LoadingState message={copy.receiptLoading} />
      </ParticipantPortalShell>
    );
  }

  if (isError) {
    return (
      <ParticipantPortalShell activeId="payments">
        <ErrorState description={error?.message} onRetry={retry} />
      </ParticipantPortalShell>
    );
  }

  return (
    <ParticipantPortalShell activeId="payments">
      <View className="gap-4">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-extrabold text-foreground">
            {copy.receiptTitle}
          </Text>
          <Text className="text-[13px] text-muted-foreground">{copy.receiptSubtitle}</Text>
        </View>

        {receipt ? (
          <ReceiptCard copy={copy} receipt={receipt} localeTag={tag} />
        ) : (
          <NoReceipt copy={copy} onCheckout={() => router.push('/checkout')} />
        )}
      </View>
    </ParticipantPortalShell>
  );
}

function NoReceipt({ copy, onCheckout }: { copy: CopyDict; onCheckout: () => void }) {
  return (
    <View className="rounded-2xl border border-border bg-card p-5">
      <Text accessibilityRole="header" className="text-base font-bold text-foreground">
        {copy.receiptEmptyTitle}
      </Text>
      <Text className="mt-1 text-[13px] text-muted-foreground">{copy.receiptEmptyBody}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.receiptGoCheckout}
        onPress={onCheckout}
        className="mt-4 min-h-[44px] items-center justify-center rounded-xl border border-border px-4"
      >
        <Text className="font-extrabold text-primary">{copy.receiptGoCheckout}</Text>
      </Pressable>
    </View>
  );
}

function ReceiptCard({
  copy,
  receipt,
  localeTag,
}: {
  copy: CopyDict;
  receipt: CapturedPaymentReceipt;
  localeTag: string;
}) {
  const money = (amountMinor: number) => formatMoneyMinor(amountMinor, receipt.currency, localeTag);
  const eventDates = formatEventDateRangeInTimeZone(
    receipt.eventStartDate,
    receipt.eventEndDate,
    'Europe/Rome',
    localeTag,
  );
  const paidAt = formatDateTimeInTimeZone(receipt.paidAt, 'Europe/Rome', localeTag);
  const methodLabel = receipt.method === 'card' ? copy.receiptMethodCard : receipt.method;
  const paymentRef = receipt.providerReference ?? '—';

  return (
    <View className="gap-4">
      <View
        className="flex-row items-center gap-3 rounded-2xl border border-success/30 bg-success/10 p-4"
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`${copy.receiptCapturedHeading}. ${copy.receiptIssuedTo}: ${receipt.participantName}`}
      >
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
          <CheckCircle2 size={22} color={colors.success} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-bold text-foreground">{copy.receiptCapturedHeading}</Text>
          <Text className="mt-0.5 text-[12px] text-muted-foreground">{copy.receiptIssuedBy}</Text>
        </View>
      </View>

      <View className="rounded-2xl border border-border bg-card p-5">
        <Text accessibilityRole="header" className="text-lg font-extrabold text-foreground">
          {receipt.participantName}
        </Text>
        <Text className="text-[12px] text-muted-foreground">{receipt.eventName}</Text>

        <View className="mt-3">
          <ReceiptRow label={copy.receiptIssuedTo} value={receipt.participantName} />
          <ReceiptRow label={copy.receiptOrderRef} value={receipt.orderId} />
          <ReceiptRow label={copy.receiptPaymentRef} value={paymentRef} />
          <ReceiptRow label={copy.labelEvent} value={receipt.eventName} />
          <ReceiptRow label={copy.receiptEventDates} value={eventDates} />
          <ReceiptRow label={copy.labelSport} value={receipt.sportProductName} />
          <ReceiptRow label={copy.statusValidatedCategory} value={receipt.categoryName} />
        </View>

        <Text
          accessibilityRole="header"
          className="mt-4 text-[11px] font-semibold tracking-wide text-muted-foreground"
        >
          {copy.checkoutOrderSummary.toUpperCase()}
        </Text>
        <View className="mt-1">
          <ReceiptRow label={copy.registrationOverviewFee} value={money(receipt.subtotalAmountMinor)} />
          <ReceiptRow label={copy.checkoutProcessingFee} value={money(receipt.serviceAmountMinor)} />
          <ReceiptRow label={copy.checkoutTotalEur} value={money(receipt.totalAmountMinor)} strong />
        </View>

        <View className="mt-1">
          <ReceiptRow label={copy.receiptPaymentMethod} value={methodLabel} />
          <ReceiptRow label={copy.receiptPaymentDate} value={paidAt} />
        </View>
      </View>

      <Text className="text-center text-[11px] text-muted-foreground">{copy.receiptDisclaimer}</Text>
    </View>
  );
}
