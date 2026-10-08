import { AlertTriangle, BadgeCheck, CheckCircle2, Circle, CreditCard, FileCheck2, Trophy, Users, XCircle } from 'lucide-react-native';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { NoEntryState } from '@/features/registration/components/NoEntryState';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { JourneyEntryStatus } from '@/domain/models/registrationJourney';
import { useRegistrationJourney } from '@/features/registration/RegistrationJourneyContext';
import { isTerminal, spineForEntry, spineIndex, STATUS_KIND } from '@/features/registration/statusLifecycle';
import { statusLabel } from '@/features/registration/statusLabels';
import { useLatestRuleChange } from '@/features/rules/hooks/useRules';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useCopy, type CopyDict } from '@/i18n';
import { formatCompactDate, formatMoneyMinor } from '@/lib/format';
import { colors } from '@/theme/colors';

export default function RegistrationStatusScreen() {
  const router = useRouter();
  const { isWideWeb } = useAppLayout();
  const journey = useRegistrationJourney();
  // The rule notice for THIS entry's sport — it was hard-coded to Tennis Men's Doubles for everyone.
  const ruleChange = useLatestRuleChange(journey.selectedSport?.name ?? '', journey.selectedProduct?.name);
  const copy = useCopy();
  const { showToast } = useToast();
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  if (journey.isLoading) {
    return (
      <ParticipantPortalShell activeId="dashboard">
        <LoadingState message={copy.statusLoading} />
      </ParticipantPortalShell>
    );
  }

  if (journey.needsEntry) {
    return (
      <ParticipantPortalShell activeId="dashboard">
        <NoEntryState />
      </ParticipantPortalShell>
    );
  }

  if (journey.isError || !journey.snapshot) {
    return (
      <ParticipantPortalShell activeId="dashboard">
        <ErrorState description={journey.error?.message} onRetry={journey.retry} />
      </ParticipantPortalShell>
    );
  }

  const { snapshot, selectedRule } = journey;
  const product = snapshot.sportEntryProducts.items.find((item) => item.id === snapshot.entry.sportEntryProductId);
  const sport = snapshot.sports.items.find((item) => item.id === snapshot.entry.sportId);
  const partner = snapshot.partners.items.find((item) => item.id === snapshot.entry.partnerAthleteId);
  const rule = selectedRule;
  const status = snapshot.entry.status;
  const confirmed = status === 'confirmed';
  const nextRoute = status === 'waitlisted' ? '/waitlist' : status === 'pending_evidence' ? '/eligibility-evidence' : status === 'pending_payment' ? '/checkout' : '/sport-entry';

  // REG-11 lifecycle — timeline spine relevant to THIS entry + withdraw affordance.
  const isTeamEntry = product?.participantType === 'team' || product?.participantType === 'crew';
  const spine = spineForEntry(Boolean(product?.requiresEvidence), isTeamEntry);
  const terminal = isTerminal(status);

  const onWithdraw = async () => {
    try {
      await journey.withdrawEntry();
      setConfirmWithdraw(false);
      showToast({ title: copy.statusWithdrawnToast, description: copy.statusWithdrawnToastBody, variant: 'error' });
    } catch {
      showToast({ title: copy.statusWithdrawError, variant: 'error' });
    }
  };

  return (
    <ParticipantPortalShell activeId="dashboard">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.statusBreadcrumb}</Text>
      <View
        style={{
          marginTop: 12,
          borderRadius: 18,
          padding: isWideWeb ? 26 : 20,
          backgroundColor: confirmed ? 'rgba(22,163,74,0.09)' : 'rgba(72,135,202,0.08)',
          borderWidth: 1,
          borderColor: confirmed ? 'rgba(22,163,74,0.28)' : 'rgba(72,135,202,0.28)',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {confirmed ? (
            <CheckCircle2 size={30} color={colors.success} />
          ) : (
            <Trophy size={30} color={colors.primary} />
          )}
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 25, fontWeight: '900' }}>
              {confirmed ? copy.statusConfirmedTitle : statusLabel(copy, snapshot.entry.status)}
            </Text>
            <Text style={{ color: colors.textMuted, marginTop: 3 }}>
              {snapshot.event.name} · {sport?.name} {product?.name}
            </Text>
          </View>
          <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: confirmed ? 'rgba(22,163,74,0.13)' : 'rgba(72,135,202,0.13)' }}>
            <Text style={{ color: confirmed ? colors.success : colors.primary, fontSize: 12, fontWeight: '900' }}>
              {statusLabel(copy, snapshot.entry.status).toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {ruleChange.data?.status === 'published' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${copy.statusRuleChangeBanner} ${copy.statusRuleChangeReview}`}
          onPress={() => router.push('/change-impact')}
          style={ruleChangeBanner}
        >
          <AlertTriangle size={18} color={colors.warning} />
          <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' }}>
            {copy.statusRuleChangeBanner}
          </Text>
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>{copy.statusRuleChangeReview}</Text>
        </Pressable>
      ) : null}

      <View style={{ marginTop: 18, ...card }}>
        <Text accessibilityRole="header" style={sectionTitle}>{copy.statusTimelineTitle}</Text>
        <StatusTimeline copy={copy} spine={spine} status={status} terminal={terminal} />
      </View>

      <View style={{ marginTop: 20, flexDirection: isWideWeb ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <View style={{ ...card, flex: 1, minWidth: 290 }}>
          <Text accessibilityRole="header" style={sectionTitle}>{copy.statusEntryCarried}</Text>
          <DetailRow icon={<Trophy size={17} color={colors.primary} />} label={copy.sportEntrySportAndEvent} value={`${sport?.name ?? '—'} · ${product?.name ?? '—'}`} />
          <DetailRow icon={<BadgeCheck size={17} color={colors.primary} />} label={copy.statusValidatedCategory} value={snapshot.entry.currentCategoryName ?? '—'} />
          {product?.requiresEvidence ? (
            <DetailRow
              icon={<FileCheck2 size={17} color={snapshot.entry.evidenceStatus === 'approved' ? colors.success : colors.warning} />}
              label={copy.statusEvidence}
              value={snapshot.entry.evidenceStatus === 'approved' ? copy.evidenceGateApproved : snapshot.entry.evidenceStatus === 'rejected' ? copy.evidenceGateRejected : copy.evidenceGatePending}
            />
          ) : null}
          <DetailRow
            icon={<Users size={17} color={colors.primary} />}
            label={journey.rosterMembers.length ? copy.rosterActiveMembers : copy.partnerMember}
            value={
              journey.rosterMembers.length
                ? journey.rosterMembers.map((member) => member.name).join(', ')
                : partner
                  ? `${partner.firstName} ${partner.lastName}`
                  : copy.individualEntry
            }
          />
          {snapshot.entry.originalCategoryName && snapshot.entry.categoryAudit?.length ? (
            <DetailRow
              icon={<FileCheck2 size={17} color={colors.warning} />}
              label={copy.rosterOriginalCategory}
              value={`${snapshot.entry.originalCategoryName} → ${snapshot.entry.currentCategoryName ?? '—'}`}
            />
          ) : null}
          <DetailRow
            icon={<FileCheck2 size={17} color={colors.primary} />}
            label={copy.statusRuleAudit}
            value={copy.statusRuleAuditValue
              .replace('{version}', snapshot.entry.ruleVersion)
              .replace('{date}', rule ? formatCompactDate(rule.referenceDate) : '—')}
          />
        </View>

        <View style={{ ...card, width: isWideWeb ? 410 : '100%' }}>
          <Text accessibilityRole="header" style={sectionTitle}>{copy.statusPaymentReconciliation}</Text>
          <DetailRow icon={<CreditCard size={17} color={colors.success} />} label={copy.statusOrderStatus} value={snapshot.order?.status === 'paid' ? copy.labelPaid : copy.labelPending} />
          <DetailRow icon={<CheckCircle2 size={17} color={colors.success} />} label={copy.statusPaymentStatus} value={snapshot.payment?.status === 'captured' ? copy.statusCapturedOnce : copy.statusNotCaptured} />
          <DetailRow icon={<CreditCard size={17} color={colors.success} />} label={copy.statusAmount} value={formatMoneyMinor(snapshot.order?.totalAmountMinor ?? 0, 'EUR')} />
          {snapshot.payment?.status === 'captured' ? (
            <View style={{ marginTop: 12, borderRadius: 10, padding: 12, backgroundColor: 'rgba(22,163,74,0.07)' }}>
              <Text style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>
                {copy.statusReconcileNote
                  .replace('{attempts}', String(snapshot.payment.attemptCount))
                  .replace('{charges}', String(snapshot.payment.chargeCount))}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: 18, ...card }}>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{copy.statusRegistrationId}</Text>
        <Text selectable style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 3 }}>{snapshot.entry.id}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 9 }}>{copy.statusLastUpdated}</Text>
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 3 }}>{snapshot.entry.updatedAt}</Text>
      </View>

      {terminal ? null : !confirmed ? (
        <Pressable accessibilityRole="button" accessibilityLabel={copy.statusContinue} onPress={() => router.push(nextRoute)} style={primaryButton}>
          <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>{copy.statusContinue}</Text>
        </Pressable>
      ) : (
        <View style={{ marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {snapshot.payment?.status === 'captured' ? (
            <Pressable accessibilityRole="button" accessibilityLabel={copy.receiptViewReceipt} onPress={() => router.push('/receipt' as Href)} style={primaryButtonFlush}>
              <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>{copy.receiptViewReceipt}</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={copy.statusViewConfig} onPress={() => router.push('/sport-entry')} style={secondaryButtonFlush}>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>{copy.statusViewConfig}</Text>
          </Pressable>
        </View>
      )}

      {/* REG-11 — terminal note, or the participant withdraw affordance (with confirm). */}
      {terminal ? (
        <View style={terminalNote}>
          <XCircle size={16} color={STATUS_KIND[status] === 'terminal_neutral' ? colors.textMuted : colors.danger} />
          <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{terminalMessage(copy, status)}</Text>
        </View>
      ) : confirmWithdraw ? (
        <View style={{ marginTop: 16, ...card, borderColor: 'rgba(220,38,38,0.35)', gap: 10 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{copy.statusWithdraw}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{copy.statusWithdrawHelp}</Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.statusWithdrawConfirm}
              accessibilityState={{ disabled: journey.isActionPending }}
              onPress={() => void onWithdraw()}
              disabled={journey.isActionPending}
              style={{ ...dangerButton, opacity: journey.isActionPending ? 0.6 : 1 }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>{copy.statusWithdrawConfirm}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={copy.statusWithdrawCancel} onPress={() => setConfirmWithdraw(false)} style={secondaryButtonInline}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{copy.statusWithdrawCancel}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={copy.statusWithdraw} onPress={() => setConfirmWithdraw(true)} style={withdrawButton}>
          <XCircle size={15} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>{copy.statusWithdraw}</Text>
        </Pressable>
      )}

      <Text style={disclaimer}>
        {copy.statusDisclaimer}
      </Text>
    </ParticipantPortalShell>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View>{icon}</View>
      <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'right', flexShrink: 1 }}>{value}</Text>
    </View>
  );
}

// REG-11 lifecycle message for a terminal entry (shown under the actions).
function terminalMessage(copy: CopyDict, status: JourneyEntryStatus): string {
  switch (status) {
    case 'withdrawn':
      return copy.statusTerminalWithdrawn;
    case 'cancelled':
      return copy.statusTerminalCancelled;
    case 'disqualified':
      return copy.statusTerminalDisqualified;
    case 'substituted':
      return copy.statusTerminalSubstituted;
    default:
      return '';
  }
}

type TimelineVariant = 'done' | 'current' | 'upcoming' | 'muted' | 'branch' | 'terminal_bad' | 'terminal_neutral';

// REG-11 status timeline — the forward spine relevant to this entry, marking done /
// current / upcoming, plus a branch row for waitlisted and a terminal row when closed.
function StatusTimeline({
  copy,
  spine,
  status,
  terminal,
}: {
  copy: CopyDict;
  spine: JourneyEntryStatus[];
  status: JourneyEntryStatus;
  terminal: boolean;
}) {
  // Waitlisted branches off pending_payment — sit it there on the spine, then add a branch row.
  const effective = status === 'waitlisted' ? 'pending_payment' : status;
  const currentIdx = spineIndex(spine, effective);
  return (
    <View style={{ marginTop: 6 }}>
      {spine.map((stageStatus, idx) => {
        const variant: TimelineVariant = terminal
          ? 'muted'
          : idx < currentIdx
            ? 'done'
            : idx === currentIdx
              ? 'current'
              : 'upcoming';
        return (
          <TimelineRow
            key={stageStatus}
            label={statusLabel(copy, stageStatus)}
            variant={variant}
            note={variant === 'current' ? copy.statusTimelineCurrent : undefined}
          />
        );
      })}
      {status === 'waitlisted' ? (
        <TimelineRow label={statusLabel(copy, 'waitlisted')} variant="branch" note={copy.statusTimelineCurrent} />
      ) : null}
      {terminal ? (
        <TimelineRow
          label={statusLabel(copy, status)}
          variant={STATUS_KIND[status] === 'terminal_neutral' ? 'terminal_neutral' : 'terminal_bad'}
        />
      ) : null}
    </View>
  );
}

function TimelineRow({ label, variant, note }: { label: string; variant: TimelineVariant; note?: string }) {
  const dot =
    variant === 'done' ? (
      <CheckCircle2 size={18} color={colors.success} />
    ) : variant === 'current' ? (
      <Circle size={18} color={colors.primary} fill={colors.primary} />
    ) : variant === 'branch' ? (
      <Circle size={18} color={colors.warning} fill={colors.warning} />
    ) : variant === 'terminal_bad' ? (
      <XCircle size={18} color={colors.danger} />
    ) : variant === 'terminal_neutral' ? (
      <Circle size={18} color={colors.textMuted} fill={colors.textMuted} />
    ) : (
      <Circle size={18} color={colors.border} />
    );
  const labelColor =
    variant === 'current' ? colors.text
      : variant === 'branch' ? colors.warning
        : variant === 'terminal_bad' ? colors.danger
          : variant === 'done' ? colors.text
            : colors.textMuted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
      {dot}
      <Text style={{ flex: 1, color: labelColor, fontSize: 13, fontWeight: variant === 'current' || variant === 'branch' || variant === 'terminal_bad' ? '800' : '600' }}>
        {label}
      </Text>
      {note ? (
        <View style={{ backgroundColor: 'rgba(72,135,202,0.13)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>{note}</Text>
        </View>
      ) : null}
    </View>
  );
}

const card = { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14, padding: 18 } as const;
const sectionTitle = { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 8 } as const;
const primaryButton = { marginTop: 18, minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 18, backgroundColor: colors.primary } as const;
const primaryButtonFlush = { minHeight: 48, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 18, backgroundColor: colors.primary } as const;
const secondaryButtonFlush = { minHeight: 46, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface } as const;
const disclaimer = { color: colors.textMuted, fontSize: 11, marginTop: 24, textAlign: 'center' } as const;
const withdrawButton = { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(220,38,38,0.4)', backgroundColor: colors.surface } as const;
const dangerButton = { minHeight: 44, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 18, backgroundColor: colors.danger } as const;
const secondaryButtonInline = { minHeight: 44, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface } as const;
const terminalNote = { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 } as const;
const ruleChangeBanner = {
  marginTop: 16,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  borderWidth: 1,
  borderColor: 'rgba(245,158,11,0.4)',
  backgroundColor: 'rgba(245,158,11,0.08)',
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
} as const;
