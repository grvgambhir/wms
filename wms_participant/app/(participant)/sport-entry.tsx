import { ChevronRight, Lock, Users, Zap } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { NoEntryState } from '@/features/registration/components/NoEntryState';
import { Text } from '@/components/ui/text';
import type { EntryGrade } from '@/domain/models/registrationJourney';
import type { TeamCalcStrategy } from '@/domain/models/rule';
import { useRegistrationJourney } from '@/features/registration/RegistrationJourneyContext';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useCopy, type CopyDict } from '@/i18n';
import { formatCompactDate, formatEventDateRangeInTimeZone, formatMoneyMinor } from '@/lib/format';
import { colors } from '@/theme/colors';
import { RepositoryError } from '@/data/errors/repositoryError';
import { useRaiseEntryException } from '@/features/registration/hooks/useMyEntries';
import { eligibilityMessage } from '@/features/rules/eligibilityMessage';

// Maps engine strategy ids to locale-aware labels (P08 System Rule Check).
function strategyLabel(copy: CopyDict, strategy: TeamCalcStrategy): string {
  switch (strategy) {
    case 'individual':
      return copy.strategyIndividual;
    case 'youngest-member':
      return copy.strategyYoungestMember;
    case 'crew-average':
      return copy.strategyCrewAverage;
    case 'relay-aggregate':
      return copy.strategyRelayAggregate;
  }
}

export default function SportEntryScreen() {
  const router = useRouter();
  const { isWideWeb } = useAppLayout();
  const journey = useRegistrationJourney();
  const copy = useCopy();
  const raiseException = useRaiseEntryException();
  const [raisedExceptionId, setRaisedExceptionId] = useState<string | null>(null);

  if (journey.isLoading) {
    return (
      <ParticipantPortalShell activeId="entries">
        <LoadingState message={copy.sportEntryLoading} />
      </ParticipantPortalShell>
    );
  }

  if (journey.needsEntry) {
    return (
      <ParticipantPortalShell activeId="entries">
        <NoEntryState />
      </ParticipantPortalShell>
    );
  }

  if (journey.isError || !journey.snapshot) {
    return (
      <ParticipantPortalShell activeId="entries">
        <ErrorState description={journey.error?.message} onRetry={journey.retry} />
      </ParticipantPortalShell>
    );
  }

  const { snapshot, selectedProduct, selectedSport, selectedRule, selectedFee, selectedQuota, derivation } = journey;
  // The entry's own product only. This screen used to offer five demo products and switching
  // between them re-pointed the entry — a different sport is a different registration, started
  // from Register.
  const connectedProducts = snapshot.sportEntryProducts.items.filter(
    (item) => item.id === snapshot.entry.sportEntryProductId,
  );
  // Only compare a category against the SAME product's stored category. Comparing across
  // products produced "Men's Doubles 35–39 → 40–44" on a swimming entry.
  const currentCategoryChanged = Boolean(
    snapshot.entry.currentCategoryName &&
      derivation?.categoryName &&
      selectedProduct?.id === snapshot.entry.sportEntryProductId &&
      snapshot.entry.currentCategoryName !== derivation.categoryName,
  );

  const proceed = async () => {
    if (selectedProduct?.participantType === 'team' || selectedProduct?.participantType === 'crew') {
      router.push('/team-roster');
      return;
    }
    try {
      const decision = await journey.confirmSelection();
      router.push(decision.nextStep === 'waitlist' ? '/waitlist' : decision.nextStep === 'evidence' ? '/eligibility-evidence' : '/checkout');
    } catch {
      // The normalized mutation error is rendered beside the action.
    }
  };
  const blocked = journey.actionError instanceof RepositoryError && journey.actionError.code === 'CATEGORY_NOT_ELIGIBLE';
  const actionErrorMessage = blocked && journey.actionError
    ? eligibilityMessage(copy, journey.actionError.message)
    : journey.actionError?.message;
  const raise = async () => {
    if (!journey.entryId) return;
    try {
      const exception = await raiseException.mutateAsync(journey.entryId);
      setRaisedExceptionId(exception.id);
    } catch {
      // Repository error is rendered alongside the original refusal below.
    }
  };

  return (
    <ParticipantPortalShell activeId="entries">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.sportEntryBreadcrumb}</Text>
      <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 6 }}>
        {copy.sportEntryTitle}
      </Text>
      <Text style={{ color: colors.textMuted, marginTop: 4, marginBottom: 20 }}>
        {copy.sportEntrySubtitle}
      </Text>

      <View style={{ flexDirection: isWideWeb ? 'row' : 'column', gap: 20, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 280, gap: 16 }}>
          <View style={card}>
            <Text accessibilityRole="header" style={sectionTitle}>{copy.labelEvent}</Text>
            <View style={{ ...fieldBox, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>{snapshot.event.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {formatEventDateRangeInTimeZone(snapshot.event.startDate, snapshot.event.endDate)} · {snapshot.event.city}
                </Text>
              </View>
              <Lock size={15} color={colors.textMuted} />
            </View>

            <Text accessibilityRole="header" style={{ ...sectionTitle, marginTop: 18 }}>{copy.sportEntrySportAndEvent}</Text>
            <View style={{ gap: 8 }}>
              {connectedProducts.map((product) => {
                const sport = snapshot.sports.items.find((item) => item.id === product.sportId);
                const quota = snapshot.quotas.items.find((item) => item.sportEntryProductId === product.id);
                const active = product.id === journey.selection.sportEntryProductId;
                return (
                  <Pressable
                    key={product.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${sport?.name ?? copy.sportEntryA11ySportFallback}, ${product.name}, ${quota?.status ?? copy.sportEntryA11yQuotaUnknown}`}
                    onPress={() => journey.selectProduct(product.id)}
                    style={{
                      ...choice,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? 'rgba(72,135,202,0.08)' : colors.surface,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '800' }}>{sport?.name}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{product.name}</Text>
                    </View>
                    <View
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        backgroundColor: quota?.status === 'full' ? 'rgba(220,38,38,0.10)' : 'rgba(22,163,74,0.10)',
                      }}
                    >
                      <Text style={{ color: quota?.status === 'full' ? colors.danger : colors.success, fontSize: 11, fontWeight: '800' }}>
                        {quota?.status === 'full' ? copy.sportEntryQuotaWaitlist : copy.sportEntryQuotaAvailable}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text accessibilityRole="header" style={{ ...sectionTitle, marginTop: 18 }}>{copy.sportEntryCompetitionGrade}</Text>
            <ChoiceRow<EntryGrade>
              value={journey.selection.grade}
              onChange={journey.selectGrade}
              options={(selectedProduct?.allowedGrades ?? []).map((grade) => ({
                value: grade,
                label: grade === 'competitive' ? copy.categoryEntryCompetitive : copy.categoryEntryRecreational,
              }))}
            />

            {selectedProduct?.participantType === 'doubles' ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 4 }}>
                  <Text accessibilityRole="header" style={{ ...sectionTitle, flex: 1 }}>{copy.sportEntryPartnerMember}</Text>
                  <Pressable
                    onPress={() => router.push('/partner-finder')}
                    accessibilityRole="link"
                    accessibilityLabel={copy.sportEntryFindPartner}
                    hitSlop={8}
                    style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{copy.sportEntryFindPartner}</Text>
                  </Pressable>
                </View>
                <View style={{ gap: 8 }}>
                  {snapshot.partners.items.map((partner) => {
                    const active = partner.id === journey.selection.partnerAthleteId;
                    return (
                      <Pressable
                        key={partner.id}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        accessibilityLabel={`${partner.firstName} ${partner.lastName}`}
                        onPress={() => journey.selectPartner(partner.id)}
                        style={{
                          ...choice,
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? 'rgba(72,135,202,0.08)' : colors.surface,
                        }}
                      >
                        <Users size={18} color={active ? colors.primary : colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: '700' }}>
                            {partner.firstName} {partner.lastName}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                            {partner.nationalityCountryCode} · {copy.sportEntryBorn.replace('{date}', partner.dateOfBirth)}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
        </View>

        <View style={{ width: isWideWeb ? 390 : '100%', gap: 16 }}>
          <View style={{ ...card, borderColor: 'rgba(72,135,202,0.38)', backgroundColor: 'rgba(72,135,202,0.06)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Zap size={18} color={colors.primary} />
              <Text style={{ color: colors.primaryDark, fontWeight: '800', fontSize: 17 }}>{copy.sportEntryRuleCheckTitle}</Text>
              <Text style={rulePill}>RUL-02</Text>
            </View>
            <View style={{ marginTop: 12 }}>
              <RuleRow label={copy.sportEntryCalcMethod} value={selectedRule ? strategyLabel(copy, selectedRule.strategy) : '—'} />
              <RuleRow label={copy.sportEntryRefDate} value={selectedRule ? formatCompactDate(selectedRule.referenceDate) : '—'} />
              <RuleRow label={copy.sportEntryRuleVersion} value={selectedRule?.version ?? '—'} />
              <RuleRow label={copy.sportEntryBandingAge} value={derivation ? String(derivation.bandingAge) : '—'} />
              <RuleRow label={copy.sportEntryCalculatedCategory} value={derivation?.categoryName ?? '—'} strong />
            </View>
            <View style={{ marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: colors.surface }}>
              <Text style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>
                <Text style={{ fontWeight: '800' }}>{copy.sportEntryVisibleRecalcLabel}</Text>
                {selectedRule?.strategy === 'individual' ? copy.sportEntryIndividualRecalcBody : copy.sportEntryVisibleRecalcBody}
              </Text>
            </View>
            {currentCategoryChanged ? (
              <View style={{ marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: 'rgba(245,158,11,0.12)' }}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
                  {copy.sportEntryCategoryChange
                    .replace('{from}', snapshot.entry.currentCategoryName ?? '')
                    .replace('{to}', derivation?.categoryName ?? '')}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={card}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>
              {copy.sportEntryNamedEntry.replace('{sport}', selectedSport?.name ?? '')}
            </Text>
            <Text style={{ color: colors.textMuted, marginTop: 3 }}>{selectedProduct?.name}</Text>
            <View style={{ marginTop: 14, gap: 7 }}>
              <RuleRow
                label={copy.labelCapacity}
                value={selectedQuota ? `${selectedQuota.confirmed} / ${selectedQuota.capacity}` : '—'}
              />
              <RuleRow
                label={copy.registrationOverviewFee}
                value={selectedFee ? formatMoneyMinor(selectedFee.baseAmountMinor, selectedFee.currency) : '—'}
                strong
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                selectedProduct?.participantType === 'team' || selectedProduct?.participantType === 'crew'
                  ? copy.sportEntryA11yManageRoster
                  : selectedProduct?.requiresEvidence
                    ? copy.sportEntryA11yEvidence
                  : selectedQuota?.status === 'full'
                    ? copy.sportEntryA11yWaitlist
                    : copy.sportEntryA11yCheckout
              }
              disabled={journey.isActionPending}
              accessibilityState={{ disabled: journey.isActionPending }}
              onPress={() => void proceed()}
              style={{ ...primaryButton, opacity: journey.isActionPending ? 0.55 : 1 }}
            >
              <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>
                {journey.isActionPending
                  ? copy.sportEntrySaving
                  : selectedProduct?.participantType === 'team' || selectedProduct?.participantType === 'crew'
                    ? copy.sportEntryManageRoster
                    : selectedProduct?.requiresEvidence
                      ? copy.sportEntryConfirmEvidence
                    : selectedQuota?.status === 'full'
                    ? copy.sportEntryConfirmWaitlist
                    : copy.sportEntryConfirmCheckout}
              </Text>
              <ChevronRight size={18} color={colors.primaryForeground} />
            </Pressable>
            {journey.actionError ? (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={errorText}>{actionErrorMessage}</Text>
            ) : null}
            {blocked && !raisedExceptionId ? (
              <Pressable accessibilityRole="button" disabled={raiseException.isPending} onPress={() => void raise()} style={secondaryButton}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>{raiseException.isPending ? copy.sportEntryRaisingException : copy.sportEntryRaiseException}</Text>
              </Pressable>
            ) : null}
            {raisedExceptionId ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.warning, fontWeight: '800', marginTop: 10 }}>{copy.sportEntryExceptionAwaitingApproval}</Text> : null}
            {raiseException.error instanceof Error ? <Text accessibilityRole="alert" style={errorText}>{raiseException.error.message}</Text> : null}
          </View>
        </View>
      </View>

      <Text style={disclaimer}>
        {copy.sportEntryDisclaimer}
      </Text>
    </ParticipantPortalShell>
  );
}

function ChoiceRow<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
              backgroundColor: active ? 'rgba(72,135,202,0.08)' : colors.surface,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: active ? colors.primary : colors.text, fontWeight: active ? '800' : '600' }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RuleRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: strong ? colors.primaryDark : colors.text, fontSize: 12, fontWeight: strong ? '800' : '600', textAlign: 'right', flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  );
}

const card = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  borderRadius: 14,
  padding: 18,
} as const;

const choice = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  borderWidth: 1,
  borderRadius: 10,
  padding: 12,
} as const;

const fieldBox = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 10,
  padding: 13,
  backgroundColor: colors.surfaceMuted,
} as const;

const sectionTitle = { color: colors.text, fontSize: 14, fontWeight: '800' } as const;
const rulePill = { color: colors.primary, fontSize: 11, fontWeight: '800', backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 } as const;
const primaryButton = { marginTop: 16, minHeight: 48, borderRadius: 10, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 } as const;
const secondaryButton = { marginTop: 10, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 } as const;
const errorText = { color: colors.danger, fontSize: 12, marginTop: 10 } as const;
const disclaimer = { color: colors.textMuted, fontSize: 11, marginTop: 24, textAlign: 'center' } as const;
