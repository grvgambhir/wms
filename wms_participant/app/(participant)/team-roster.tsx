import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCcw, ShieldCheck, UserPlus, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { NoEntryState } from '@/features/registration/components/NoEntryState';
import { Text } from '@/components/ui/text';
import { repositories } from '@/data/providers/repositories';
import type { EntryDecision } from '@/domain/models/registrationJourney';
import type { TeamRosterMember, TeamRosterRole } from '@/domain/models/teamRoster';
import { ageOn } from '@/features/rules/engine';
import { useRegistrationJourney } from '@/features/registration/RegistrationJourneyContext';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useCopy, type CopyDict } from '@/i18n';
import { formatCompactDate, formatMoneyMinor } from '@/lib/format';
import { colors } from '@/theme/colors';

function roleLabel(copy: CopyDict, role: TeamRosterRole): string {
  if (role === 'captain') return copy.rosterRoleCaptain;
  if (role === 'player') return copy.rosterRolePlayer;
  if (role === 'rower') return copy.rosterRoleRower;
  return copy.rosterRoleCoxswain;
}

function signature(ids: string[]): string {
  return [...ids].sort().join('|');
}

export default function TeamRosterScreen() {
  const router = useRouter();
  const { isWideWeb } = useAppLayout();
  const journey = useRegistrationJourney();
  const copy = useCopy();
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [decision, setDecision] = useState<EntryDecision | null>(null);
  const [proposal, setProposal] = useState<{ id: string } | null>(null);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const productId = journey.selectedProduct?.id;
  // By participant type, not by two demo product ids: a team is the "younger player added"
  // story, a crew is the substitution story.
  const isBasketball = journey.selectedProduct?.participantType === 'team';
  const isRowing = journey.selectedProduct?.participantType === 'crew';
  const roster = journey.teamRoster;
  const activeIds = journey.rosterMembers.map((member) => member.id);
  const currentSignature = signature(activeIds);
  const isSaved = Boolean(savedSignature && savedSignature === currentSignature);
  const substitute = roster?.members.find((member) => roster.substituteMemberIds.includes(member.id));
  const outgoingRower = isRowing
    ? [...(roster?.members ?? [])]
        .reverse()
        .find((member) => roster?.originalMemberIds.includes(member.id) && member.role === 'rower')
    : undefined;
  const substitutionApplied = Boolean(substitute && activeIds.includes(substitute.id));
  const youngerAdded = Boolean(substitute && activeIds.includes(substitute.id));
  const changed = Boolean(journey.rosterImpact?.changed);
  // A confirmed (in the real flow, paid) team can't have its roster overwritten by the general
  // entry save — the backend refuses that transition on purpose (RUL-03/04). It goes through a
  // propose-then-OC-approve path instead; nothing here changes the entry's own status.
  const isConfirmedEntry = journey.snapshot?.entry.status === 'confirmed';
  const needsTeam = journey.isRosterError && journey.rosterError?.name !== 'NetworkError';
  const candidateMembers = useMemo(() => {
    const normalized = inviteQuery.trim().toLowerCase();
    const excluded = new Set([
      ...(roster?.members.map((member) => member.athleteId) ?? []),
      ...(roster?.pendingInvitations?.map((invitation) => invitation.inviteePersonId) ?? []),
    ]);
    return (journey.snapshot?.partners.items ?? [])
      .filter((athlete) => !excluded.has(athlete.id))
      .filter((athlete) => !normalized || `${athlete.firstName} ${athlete.lastName}`.toLowerCase().includes(normalized))
      .slice(0, 5);
  }, [inviteQuery, journey.snapshot?.partners.items, roster?.members, roster?.pendingInvitations]);

  const originalFee = journey.snapshot?.fees.items.find(
    (item) =>
      item.sportEntryProductId === productId &&
      item.grade === journey.selection.grade &&
      item.categoryId === roster?.originalCategoryId,
  );
  const originalQuota = journey.snapshot?.quotas.items.find(
    (item) => item.sportEntryProductId === productId && item.categoryId === roster?.originalCategoryId,
  );
  const recordedAudit =
    isSaved && journey.snapshot?.entry.sportEntryProductId === productId
      ? journey.snapshot?.entry.categoryAudit?.at(-1)
      : undefined;

  const saveRoster = async () => {
    try {
      if (isConfirmedEntry && substitute) {
        const result = await journey.proposeRosterChange({
          // Backend roster-substitutions takes core.person ids, not roster_member ids —
          // `member.id` here is the roster_member row, `athleteId` is the person.
          replacePersonId: isRowing ? outgoingRower?.athleteId : undefined,
          withPersonId: substitute.athleteId,
        });
        setProposal({ id: result.id });
      } else {
        const nextDecision = await journey.confirmSelection();
        setDecision(nextDecision);
      }
      setSavedSignature(currentSignature);
    } catch {
      // The normalized repository error is displayed beside the action.
    }
  };

  const resetRoster = () => {
    setSavedSignature(null);
    setDecision(null);
    setProposal(null);
    journey.resetRoster();
  };

  const createTeam = async () => {
    try {
      await journey.createTeam();
    } catch {
      // The normalized refusal is rendered below the action.
    }
  };

  const invite = async (personId: string) => {
    if (!roster || !productId) return;
    setInviteBusyId(personId);
    setInviteError(null);
    try {
      await repositories.teamRosters.invite({
        teamId: roster.id,
        sportEntryProductId: productId,
        inviteePersonId: personId,
      });
      setInviteQuery('');
      journey.retry();
    } catch (caught) {
      setInviteError(caught instanceof Error ? caught.message : copy.rosterInviteError);
    } finally {
      setInviteBusyId(null);
    }
  };

  const cancelInvite = async (invitationId: string) => {
    setInviteBusyId(invitationId);
    setInviteError(null);
    try {
      await repositories.teamRosters.cancelInvitation(invitationId);
      journey.retry();
    } catch (caught) {
      setInviteError(caught instanceof Error ? caught.message : copy.rosterInviteError);
    } finally {
      setInviteBusyId(null);
    }
  };

  if (journey.isLoading) {
    return (
      <ParticipantPortalShell activeId="team">
        <LoadingState message={copy.rosterLoading} />
      </ParticipantPortalShell>
    );
  }

  if (journey.needsEntry) {
    return (
      <ParticipantPortalShell activeId="team">
        <NoEntryState />
      </ParticipantPortalShell>
    );
  }

  if (journey.isError || !journey.snapshot) {
    return (
      <ParticipantPortalShell activeId="team">
        <ErrorState description={journey.error?.message} onRetry={journey.retry} />
      </ParticipantPortalShell>
    );
  }

  return (
    <ParticipantPortalShell activeId="team">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.rosterBreadcrumb}</Text>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 6 }}>{copy.rosterTitle}</Text>
      <Text style={{ color: colors.textMuted, marginTop: 4, marginBottom: 18 }}>{copy.rosterSubtitle}</Text>

      {!isBasketball && !isRowing ? (
        <View style={card}>
          <Text style={{ color: colors.textMuted }}>{copy.rosterUnavailable}</Text>
        </View>
      ) : journey.isRosterLoading ? (
        <LoadingState message={copy.rosterLoading} />
      ) : needsTeam || !roster ? (
        <View style={{ ...card, maxWidth: 560, gap: 12 }}>
          <Text style={sectionTitle}>{copy.rosterCreateTitle}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>{copy.rosterCreateBody}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: journey.isActionPending }}
            disabled={journey.isActionPending}
            onPress={() => void createTeam()}
            style={{ ...primaryButton, opacity: journey.isActionPending ? 0.55 : 1 }}
          >
            <Text style={primaryButtonText}>{journey.isActionPending ? copy.rosterCreating : copy.rosterCreateAction}</Text>
          </Pressable>
          {journey.actionError ? <Text accessibilityRole="alert" style={errorText}>{journey.actionError.message}</Text> : null}
        </View>
      ) : !journey.selectedRule || !journey.derivation ? (
        <ErrorState description={journey.rosterError?.message ?? copy.rosterUnavailable} />
      ) : (
        <View style={{ flexDirection: isWideWeb ? 'row' : 'column', gap: 20, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 290, gap: 16 }}>
              <View style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Users size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={sectionTitle}>{roster.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{copy.rosterActiveMembers}</Text>
                </View>
                <Text style={countPill}>{journey.rosterMembers.length}</Text>
              </View>

              <View style={card}>
                <Text style={sectionTitle}>{copy.rosterInviteTitle}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>{copy.rosterInviteBody}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, marginTop: 12 }}>
                  <TextInput
                    value={inviteQuery}
                    onChangeText={setInviteQuery}
                    placeholder={copy.rosterInviteSearch}
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel={copy.rosterInviteSearch}
                    style={{ color: colors.text, flex: 1, minHeight: 42, fontSize: 13 }}
                  />
                </View>
                <View style={{ gap: 8, marginTop: 10 }}>
                  {candidateMembers.map((athlete) => (
                    <View key={athlete.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>{athlete.firstName} {athlete.lastName}</Text>
                      <Pressable onPress={() => void invite(athlete.id)} disabled={inviteBusyId !== null} style={secondaryButton}>
                        <Text style={{ color: colors.primary, fontWeight: '800' }}>{inviteBusyId === athlete.id ? copy.rosterInviting : copy.rosterInviteAction}</Text>
                      </Pressable>
                    </View>
                  ))}
                  {inviteQuery && candidateMembers.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{copy.rosterInviteEmpty}</Text> : null}
                </View>
                {(roster.pendingInvitations ?? []).map((invitation) => {
                  const athlete = journey.snapshot?.partners.items.find((item) => item.id === invitation.inviteePersonId);
                  return (
                    <View key={invitation.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <Text style={{ color: colors.warning, flex: 1, fontSize: 12 }}>
                        {copy.rosterInvitePending.replace('{name}', athlete ? `${athlete.firstName} ${athlete.lastName}` : invitation.inviteePersonId)}
                      </Text>
                      <Pressable onPress={() => void cancelInvite(invitation.id)} disabled={inviteBusyId !== null} style={secondaryButton}>
                        <Text style={{ color: colors.primary, fontWeight: '800' }}>{copy.rosterInviteRemove}</Text>
                      </Pressable>
                    </View>
                  );
                })}
                {inviteError ? <Text accessibilityRole="alert" style={errorText}>{inviteError}</Text> : null}
              </View>
              <View style={{ gap: 8, marginTop: 14 }}>
                {journey.rosterMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    referenceDate={journey.selectedRule!.referenceDate}
                    excluded={journey.derivation!.memberAges.find((item) => item.id === member.id)?.excluded ?? false}
                    copy={copy}
                  />
                ))}
              </View>
            </View>

            {substitute ? (
              <View style={{ ...card, borderColor: 'rgba(72,135,202,0.35)' }}>
                <Text style={sectionTitle}>
                  {isBasketball ? copy.rosterYoungerTitle : copy.rosterSubstitutionTitle}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
                  {isBasketball ? copy.rosterYoungerHint : copy.rosterSubstitutionHint}
                </Text>
                <View style={{ marginTop: 12 }}>
                  <MemberRow
                    member={substitute}
                    referenceDate={journey.selectedRule.referenceDate}
                    excluded={false}
                    copy={copy}
                  />
                </View>
                {!substitutionApplied ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isRowing && outgoingRower
                        ? copy.rosterSubstituteAction
                            .replace('{out}', outgoingRower.name)
                            .replace('{in}', substitute.name)
                        : copy.rosterAddYounger
                    }
                    onPress={() => {
                      setSavedSignature(null);
                      setDecision(null);
                      if (isRowing && outgoingRower) {
                        journey.substituteRosterMember(outgoingRower.id, substitute.id);
                      } else {
                        journey.addRosterMember(substitute.id);
                      }
                    }}
                    style={primaryButton}
                  >
                    <UserPlus size={17} color={colors.primaryForeground} />
                    <Text style={primaryButtonText}>
                      {isRowing && outgoingRower
                        ? copy.rosterSubstituteAction
                            .replace('{out}', outgoingRower.name)
                            .replace('{in}', substitute.name)
                        : copy.rosterAddYounger}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={successStrip}>
                    <CheckCircle2 size={17} color={colors.success} />
                    <Text style={{ color: colors.success, fontWeight: '800', fontSize: 12 }}>
                      {isBasketball ? copy.rosterYoungerAdded : copy.rosterSubstituted}
                    </Text>
                  </View>
                )}
                {activeIds.some((id) => !roster.originalMemberIds.includes(id)) ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={copy.rosterReset} onPress={resetRoster} style={secondaryButton}>
                    <RefreshCcw size={15} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: '800' }}>{copy.rosterReset}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={{ width: isWideWeb ? 420 : '100%', gap: 16 }}>
            <View style={{ ...card, borderColor: changed ? 'rgba(245,158,11,0.45)' : 'rgba(72,135,202,0.35)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={19} color={colors.primary} />
                <Text style={sectionTitle}>{copy.rosterRuleImpact}</Text>
                <Text style={rulePill}>RUL-03/04</Text>
              </View>
              <View style={{ marginTop: 12 }}>
                <ImpactRow label={copy.sportEntryCalcMethod} value={isBasketball ? copy.strategyYoungestMember : copy.strategyCrewAverage} />
                <ImpactRow label={copy.sportEntryRefDate} value={formatCompactDate(journey.selectedRule.referenceDate)} />
                <ImpactRow label={copy.rosterOriginalCategory} value={roster.originalCategoryName} />
                <ImpactRow label={copy.rosterCurrentCategory} value={journey.derivation.categoryName} strong />
                <ImpactRow label={copy.rosterBandingAge} value={String(journey.derivation.bandingAge)} />
                <ImpactRow
                  label={copy.rosterPrice}
                  value={`${originalFee ? formatMoneyMinor(originalFee.baseAmountMinor, originalFee.currency) : '—'}${
                    changed && journey.selectedFee
                      ? ` → ${formatMoneyMinor(journey.selectedFee.baseAmountMinor, journey.selectedFee.currency)}`
                      : ''
                  }`}
                />
                <ImpactRow
                  label={copy.rosterQuota}
                  value={`${quotaValue(copy, originalQuota)}${
                    changed && journey.selectedQuota ? ` → ${quotaValue(copy, journey.selectedQuota)}` : ''
                  }`}
                />
              </View>
              {isRowing ? (
                <View style={infoStrip}>
                  <Text style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>
                    {journey.derivation.note}
                  </Text>
                </View>
              ) : null}

              {changed && journey.rosterImpact ? (
                <View style={warningBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <AlertTriangle size={18} color={colors.warning} />
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '900', flex: 1 }}>
                      {copy.rosterWarningTitle}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 7 }}>
                    {isBasketball ? copy.rosterBasketballWarning : copy.rosterRowingWarning}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={card}>
              <Text style={sectionTitle}>{copy.rosterAuditTitle}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 8 }}>
                {copy.rosterOriginalPreserved.replace('{category}', roster.originalCategoryName)}
              </Text>
              {changed && journey.rosterImpact ? (
                <View style={auditLine}>
                  <Text selectable style={{ color: colors.text, fontSize: 11, lineHeight: 17, fontWeight: '700' }}>
                    {(recordedAudit ? copy.rosterAuditRecorded : copy.rosterAuditPreview)
                      .replace('{time}', recordedAudit?.occurredAt ?? '')
                      .replace('{from}', journey.rosterImpact.fromCategory)
                      .replace('{to}', journey.rosterImpact.toCategory)
                      .replace(
                        '{reason}',
                        isBasketball ? copy.rosterBasketballWarning : copy.rosterRowingWarning,
                      )}
                  </Text>
                </View>
              ) : null}

              {!isSaved ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    journey.isActionPending
                      ? isConfirmedEntry
                        ? copy.rosterProposing
                        : copy.rosterSaving
                      : isConfirmedEntry
                        ? copy.rosterProposeToOrganiser
                        : copy.rosterSaveRevalidate
                  }
                  accessibilityState={{ disabled: journey.isActionPending }}
                  disabled={journey.isActionPending}
                  onPress={() => void saveRoster()}
                  style={{ ...primaryButton, opacity: journey.isActionPending ? 0.55 : 1 }}
                >
                  <Text style={primaryButtonText}>
                    {journey.isActionPending
                      ? isConfirmedEntry
                        ? copy.rosterProposing
                        : copy.rosterSaving
                      : isConfirmedEntry
                        ? copy.rosterProposeToOrganiser
                        : copy.rosterSaveRevalidate}
                  </Text>
                </Pressable>
              ) : proposal ? (
                <View style={successStrip}>
                  <CheckCircle2 size={17} color={colors.success} />
                  <Text style={{ color: colors.success, fontWeight: '800', fontSize: 12, flex: 1 }}>
                    {copy.rosterProposed}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={successStrip}>
                    <CheckCircle2 size={17} color={colors.success} />
                    <Text style={{ color: colors.success, fontWeight: '800', fontSize: 12, flex: 1 }}>
                      {copy.rosterSaved}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={decision?.nextStep === 'waitlist' ? copy.rosterContinueWaitlist : copy.rosterContinueCheckout}
                    onPress={() => router.push(decision?.nextStep === 'waitlist' ? '/waitlist' : '/checkout')}
                    style={primaryButton}
                  >
                    <Text style={primaryButtonText}>
                      {decision?.nextStep === 'waitlist' ? copy.rosterContinueWaitlist : copy.rosterContinueCheckout}
                    </Text>
                    <ArrowRight size={17} color={colors.primaryForeground} />
                  </Pressable>
                </>
              )}
              {journey.actionError ? (
                <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={errorText}>{journey.actionError.message}</Text>
              ) : null}
            </View>
          </View>
        </View>
      )}

      <Text style={disclaimer}>{copy.rosterDisclaimer}</Text>
    </ParticipantPortalShell>
  );
}

function quotaValue(copy: CopyDict, quota: { confirmed: number; capacity: number; status: string } | undefined): string {
  if (!quota) return '—';
  return copy.rosterQuotaValue
    .replace('{confirmed}', String(quota.confirmed))
    .replace('{capacity}', String(quota.capacity))
    .replace('{status}', quota.status === 'full' ? copy.sportEntryQuotaWaitlist : copy.sportEntryQuotaAvailable);
}

function MemberRow({
  member,
  referenceDate,
  excluded,
  copy,
}: {
  member: TeamRosterMember;
  referenceDate: string;
  excluded: boolean;
  copy: CopyDict;
}) {
  return (
    <View style={memberRow}>
      <View style={avatar}>
        <Text style={{ color: colors.primary, fontWeight: '900', fontSize: 12 }}>
          {member.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{member.name}</Text>
          <Text style={rolePill}>{roleLabel(copy, member.role)}</Text>
          {excluded ? <Text style={excludedPill}>{copy.rosterExcluded}</Text> : null}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>
          {copy.rosterBornAge
            .replace('{date}', member.dob)
            .replace('{age}', String(ageOn(member.dob, referenceDate)))}
        </Text>
      </View>
    </View>
  );
}

function ImpactRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{label}</Text>
      <Text style={{ color: strong ? colors.primaryDark : colors.text, fontSize: 12, fontWeight: strong ? '900' : '700', textAlign: 'right', flexShrink: 1 }}>{value}</Text>
    </View>
  );
}

const card = { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14, padding: 18 } as const;
const sectionTitle = { color: colors.text, fontSize: 16, fontWeight: '900' } as const;
const memberRow = { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, borderRadius: 10, padding: 10 } as const;
const avatar = { width: 34, height: 34, borderRadius: 999, backgroundColor: 'rgba(72,135,202,0.12)', alignItems: 'center', justifyContent: 'center' } as const;
const rolePill = { color: colors.primaryDark, fontSize: 10, fontWeight: '800', backgroundColor: 'rgba(72,135,202,0.11)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 } as const;
const excludedPill = { color: colors.warning, fontSize: 9, fontWeight: '900', backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 } as const;
const countPill = { color: colors.primary, fontWeight: '900', fontSize: 12, backgroundColor: 'rgba(72,135,202,0.1)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 } as const;
const rulePill = { color: colors.primary, fontSize: 10, fontWeight: '900', backgroundColor: 'rgba(72,135,202,0.1)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 } as const;
const primaryButton = { marginTop: 14, minHeight: 46, borderRadius: 10, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 15 } as const;
const primaryButtonText = { color: colors.primaryForeground, fontWeight: '800', fontSize: 13 } as const;
const secondaryButton = { marginTop: 10, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 13 } as const;
const successStrip = { marginTop: 12, padding: 11, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(22,163,74,0.08)' } as const;
const infoStrip = { marginTop: 12, padding: 11, borderRadius: 9, backgroundColor: 'rgba(72,135,202,0.08)' } as const;
const warningBox = { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.10)' } as const;
const auditLine = { marginTop: 10, padding: 11, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted } as const;
const errorText = { color: colors.danger, fontSize: 12, marginTop: 10 } as const;
const disclaimer = { color: colors.textMuted, fontSize: 11, marginTop: 24, textAlign: 'center' } as const;
