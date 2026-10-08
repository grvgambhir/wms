import { CheckCircle2, Clock, CreditCard, Lock, ShieldCheck } from 'lucide-react-native';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { NoEntryState } from '@/features/registration/components/NoEntryState';
import { Text } from '@/components/ui/text';
import { useRegistrationJourney } from '@/features/registration/RegistrationJourneyContext';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useCopy } from '@/i18n';
import { formatMoneyMinor } from '@/lib/format';
import { colors } from '@/theme/colors';

export default function CheckoutScreen() {
  const router = useRouter();
  const { isWideWeb } = useAppLayout();
  const journey = useRegistrationJourney();
  const copy = useCopy();
  const [simulateTimeout, setSimulateTimeout] = useState(true);

  if (journey.isLoading) {
    return (
      <ParticipantPortalShell activeId="payments">
        <LoadingState message={copy.checkoutLoading} />
      </ParticipantPortalShell>
    );
  }

  if (journey.needsEntry) {
    return (
      <ParticipantPortalShell activeId="payments">
        <NoEntryState />
      </ParticipantPortalShell>
    );
  }

  if (journey.isError || !journey.snapshot) {
    return (
      <ParticipantPortalShell activeId="payments">
        <ErrorState description={journey.error?.message} onRetry={journey.retry} />
      </ParticipantPortalShell>
    );
  }

  const { snapshot, selectedFee, selectedPartner, selectedProduct, selectedSport } = journey;
  const order = snapshot.order;
  const totalMinor = order?.totalAmountMinor ?? selectedFee?.baseAmountMinor ?? 0;
  const confirmed = snapshot.entry.status === 'confirmed' && snapshot.payment?.status === 'captured';

  const pay = async () => {
    try {
      await journey.payOrder(simulateTimeout);
    } catch {
      // The normalized mutation error is rendered below.
    }
  };

  return (
    <ParticipantPortalShell activeId="payments">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.checkoutBreadcrumb}</Text>
      <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 6 }}>{copy.checkoutTitle}</Text>
      <Text style={{ color: colors.textMuted, marginTop: 4, marginBottom: 20 }}>
        {copy.checkoutSubtitle}
      </Text>

      <View style={{ flexDirection: isWideWeb ? 'row' : 'column', gap: 20, alignItems: 'flex-start' }}>
        <View style={{ ...card, flex: 1, minWidth: 290 }}>
          <Text accessibilityRole="header" style={sectionTitle}>{copy.checkoutOrderSummary}</Text>
          <SummaryRow label={copy.labelEvent} value={snapshot.event.shortName ?? snapshot.event.name} />
          <SummaryRow label={copy.labelSport} value={`${selectedSport?.name ?? '—'} · ${selectedProduct?.name ?? '—'}`} />
          <SummaryRow label={copy.labelCategory} value={snapshot.entry.currentCategoryName ?? journey.derivation?.categoryName ?? '—'} />
          <SummaryRow label={copy.labelGrade} value={snapshot.entry.grade === 'competitive' ? copy.categoryEntryCompetitive : copy.categoryEntryRecreational} />
          {selectedProduct?.requiresEvidence ? <SummaryRow label={copy.statusEvidence} value={snapshot.entry.evidenceStatus === 'approved' ? copy.evidenceStatusApproved : copy.evidenceStatusUnderReview} /> : null}
          <SummaryRow
            label={journey.rosterMembers.length ? copy.rosterActiveMembers : copy.partnerMember}
            value={
              journey.rosterMembers.length
                ? journey.rosterMembers.map((member) => member.name).join(', ')
                : selectedProduct?.partnerRequired && selectedPartner
                  ? `${selectedPartner.firstName} ${selectedPartner.lastName}`
                  : copy.individualEntry
            }
          />
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 9 }} />
          <SummaryRow label={copy.registrationOverviewFee} value={formatMoneyMinor(order?.subtotalAmountMinor ?? selectedFee?.baseAmountMinor ?? 0, 'EUR')} strong />
          <SummaryRow label={copy.checkoutProcessingFee} value={formatMoneyMinor(order?.serviceAmountMinor ?? 0, 'EUR')} muted />
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 9 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 14 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>{copy.checkoutTotalEur}</Text>
            <Text style={{ color: colors.text, fontWeight: '900', fontSize: 21 }}>{formatMoneyMinor(totalMinor, 'EUR')}</Text>
          </View>
          <View style={{ marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: colors.surfaceMuted }}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{copy.checkoutRegistrationEntry}</Text>
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 2 }}>{snapshot.entry.id}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>{copy.checkoutOrder}</Text>
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 2 }}>{order?.id ?? copy.labelPending}</Text>
          </View>
        </View>

        <View style={{ ...card, width: isWideWeb ? 400 : '100%' }}>
          <Text accessibilityRole="header" style={sectionTitle}>{copy.paymentTitle}</Text>
          <View style={{ ...paymentMethod, marginTop: 12 }}>
            <CreditCard size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Visa •••• 4242</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{copy.checkoutTestCardHint}</Text>
            </View>
            <Lock size={14} color={colors.textMuted} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <ShieldCheck size={14} color={colors.success} />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{copy.checkoutPciNote}</Text>
          </View>

          {!confirmed ? (
            <>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={copy.checkoutSimulateTimeout}
                accessibilityState={{ checked: simulateTimeout, disabled: journey.isActionPending }}
                onPress={() => setSimulateTimeout((current) => !current)}
                disabled={journey.isActionPending}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, minHeight: 44 }}
              >
                <View style={{ ...checkbox, borderColor: simulateTimeout ? colors.primary : colors.border, backgroundColor: simulateTimeout ? colors.primary : colors.surface }}>
                  {simulateTimeout ? <Text style={{ color: colors.primaryForeground, fontSize: 11, fontWeight: '900' }}>✓</Text> : null}
                </View>
                <Text style={{ flex: 1, color: colors.textMuted, fontSize: 12 }}>
                  {copy.checkoutSimulateTimeout}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={journey.isActionPending ? copy.checkoutAuthorising : copy.checkoutPay.replace('{amount}', formatMoneyMinor(totalMinor, 'EUR'))}
                accessibilityState={{ disabled: journey.isActionPending || !order || snapshot.entry.status !== 'pending_payment' }}
                disabled={journey.isActionPending || !order || snapshot.entry.status !== 'pending_payment'}
                onPress={() => void pay()}
                style={{ ...primaryButton, opacity: journey.isActionPending || !order || snapshot.entry.status !== 'pending_payment' ? 0.55 : 1 }}
              >
                <Text style={{ color: colors.primaryForeground, fontWeight: '800', fontSize: 15 }}>
                  {journey.isActionPending ? copy.checkoutAuthorising : copy.checkoutPay.replace('{amount}', formatMoneyMinor(totalMinor, 'EUR'))}
                </Text>
              </Pressable>
            </>
          ) : null}

          {journey.isActionPending ? (
            <View style={{ ...statusBox, borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.08)', marginTop: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Clock size={17} color={colors.warning} />
                <Text style={{ color: colors.text, fontWeight: '700' }}>{copy.checkoutProcessingSafe}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                {copy.checkoutTimeoutRetry}
              </Text>
            </View>
          ) : null}

          {confirmed ? (
            <View style={{ ...statusBox, borderColor: 'rgba(22,163,74,0.4)', backgroundColor: 'rgba(22,163,74,0.07)', marginTop: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={19} color={colors.success} />
                <Text style={{ color: colors.text, fontWeight: '800' }}>{copy.checkoutPaymentConfirmed}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 7 }}>
                {copy.checkoutReconcileNote
                  .replace('{attempts}', String(snapshot.payment?.attemptCount ?? 1))
                  .replace('{charges}', String(snapshot.payment?.chargeCount ?? 1))}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={copy.receiptViewReceipt} onPress={() => router.push('/receipt' as Href)} style={secondaryButton}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>{copy.receiptViewReceipt}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={copy.checkoutViewStatus} onPress={() => router.push('/registration-status')} style={secondaryButton}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>{copy.checkoutViewStatus}</Text>
              </Pressable>
            </View>
          ) : null}

          {snapshot.entry.status === 'draft' ? (
            <View style={{ ...statusBox, marginTop: 14 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{copy.checkoutConfirmBeforePay}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={copy.checkoutReturnSportEntry} onPress={() => router.replace('/sport-entry')} style={secondaryButton}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>{copy.checkoutReturnSportEntry}</Text>
              </Pressable>
            </View>
          ) : null}
          {snapshot.entry.status === 'pending_evidence' ? (
            <View style={{ ...statusBox, marginTop: 14, borderColor: 'rgba(245,158,11,0.45)', backgroundColor: 'rgba(245,158,11,0.07)' }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{copy.checkoutEvidenceRequired}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={copy.checkoutReturnEvidence} onPress={() => router.replace('/eligibility-evidence')} style={secondaryButton}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>{copy.checkoutReturnEvidence}</Text>
              </Pressable>
            </View>
          ) : null}
          {journey.actionError ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={errorText}>{journey.actionError.message}</Text>
          ) : null}
        </View>
      </View>

      <Text style={disclaimer}>
        {copy.checkoutDisclaimer}
      </Text>
    </ParticipantPortalShell>
  );
}

function SummaryRow({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 7 }}>
      <Text style={{ color: muted ? colors.textMuted : colors.text, fontSize: 13 }}>{label}</Text>
      <Text style={{ flexShrink: 1, textAlign: 'right', color: muted ? colors.textMuted : colors.text, fontSize: 13, fontWeight: strong ? '800' : '600' }}>
        {value}
      </Text>
    </View>
  );
}

const card = { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14, padding: 18 } as const;
const sectionTitle = { color: colors.text, fontSize: 17, fontWeight: '800' } as const;
const paymentMethod = { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 } as const;
const checkbox = { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' } as const;
const primaryButton = { marginTop: 16, minHeight: 48, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 } as const;
const secondaryButton = { marginTop: 12, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 } as const;
const statusBox = { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12 } as const;
const errorText = { color: colors.danger, fontSize: 12, marginTop: 10 } as const;
const disclaimer = { color: colors.textMuted, fontSize: 11, marginTop: 24, textAlign: 'center' } as const;
