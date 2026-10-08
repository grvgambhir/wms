import { CheckCircle2, FileCheck2, FileUp, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { NoEntryState } from '@/features/registration/components/NoEntryState';
import { Text } from '@/components/ui/text';
import type { EvidenceDeclaredAttribute, EligibilityEvidence, EvidenceStatus } from '@/domain/models/evidence';
import type { RestrictedEvidence } from '@/domain/models/restrictedEvidence';
import { judoEvidenceDeclaration } from '@/features/evidence/ordinaryEvidence';
import { useEligibilityEvidence } from '@/features/evidence/hooks/useEligibilityEvidence';
import { useRegistrationJourney } from '@/features/registration/RegistrationJourneyContext';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useCopy, type CopyDict } from '@/i18n';
import { colors } from '@/theme/colors';

function statusLabel(copy: CopyDict, status: EvidenceStatus): string {
  if (status === 'required') return copy.evidenceStatusRequired;
  if (status === 'uploaded') return copy.evidenceStatusUploaded;
  if (status === 'under_review') return copy.evidenceStatusUnderReview;
  if (status === 'approved') return copy.evidenceStatusApproved;
  return copy.evidenceStatusRejected;
}

function gateLabel(copy: CopyDict, status: string): string {
  if (status === 'approved') return copy.evidenceGateApproved;
  if (status === 'rejected') return copy.evidenceGateRejected;
  if (status === 'pending_review') return copy.evidenceGatePending;
  return copy.evidenceGateRequired;
}

export default function EligibilityEvidenceScreen() {
  const router = useRouter();
  const { isWideWeb } = useAppLayout();
  const journey = useRegistrationJourney();
  const copy = useCopy();
  const product = journey.selectedProduct;
  const evidence = useEligibilityEvidence({
    registrationEntryId: journey.snapshot?.entry.id,
    sportEntryProductId: product?.id,
    enabled: Boolean(product?.requiresEvidence),
  });

  if (journey.isLoading || evidence.isLoading) {
    return <ParticipantPortalShell activeId="evidence"><LoadingState message={copy.evidenceLoading} /></ParticipantPortalShell>;
  }
  if (journey.needsEntry) {
    return (
      <ParticipantPortalShell activeId="evidence">
        <NoEntryState />
      </ParticipantPortalShell>
    );
  }

  if (journey.isError || evidence.isError || !journey.snapshot) {
    return (
      <ParticipantPortalShell activeId="evidence">
        <ErrorState description={(journey.error ?? evidence.error)?.message} onRetry={() => { journey.retry(); void evidence.refresh(); }} />
      </ParticipantPortalShell>
    );
  }
  if (!product?.requiresEvidence) {
    return (
      <ParticipantPortalShell activeId="evidence">
        <Text accessibilityRole="header" style={title}>{copy.evidenceTitle}</Text>
        <View style={{ ...card, marginTop: 18 }}><Text style={body}>{copy.evidenceUnavailable}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.checkoutReturnSportEntry} onPress={() => router.replace('/sport-entry')} style={secondaryButton}><Text style={secondaryText}>{copy.checkoutReturnSportEntry}</Text></Pressable>
      </ParticipantPortalShell>
    );
  }

  const restricted = evidence.restricted.data?.items[0];
  const gateStatus = journey.snapshot.entry.evidenceStatus;
  const approved = gateStatus === 'approved' && restricted?.status === 'approved';
  const isPara = restricted?.type === 'para_classification';

  const applyRestrictedAction = async (
    action: (id: string) => Promise<{ entryEvidenceStatus: 'not_required' | 'required' | 'pending_review' | 'approved' | 'rejected' }>,
  ) => {
    if (!restricted) return;
    try {
      const response = await action(restricted.id);
      await journey.applyEvidenceStatus(response.entryEvidenceStatus);
    } catch {
      // Normalized hook/context errors are rendered below.
    }
  };

  return (
    <ParticipantPortalShell activeId="evidence">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.evidenceBreadcrumb}</Text>
      <Text accessibilityRole="header" style={{ ...title, marginTop: 6 }}>{copy.evidenceTitle}</Text>
      <Text style={{ ...body, marginTop: 4, marginBottom: 20 }}>{copy.evidenceSubtitle}</Text>

      <View style={{ ...card, backgroundColor: 'rgba(72,135,202,0.07)', borderColor: 'rgba(72,135,202,0.34)' }}>
        <Text accessibilityRole="header" style={sectionTitle}>{copy.evidenceEntrySummary}</Text>
        <Text style={{ color: colors.text, fontWeight: '800', marginTop: 8 }}>{journey.selectedSport?.name} · {product.name}</Text>
        <Text style={{ ...body, fontSize: 12, marginTop: 4 }}>
          {copy.evidenceAgeRule.replace('{age}', String(journey.derivation?.bandingAge ?? '—')).replace('{category}', journey.derivation?.categoryName ?? '—')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
          {approved ? (
            <CheckCircle2 size={18} color={colors.success} />
          ) : (
            <LockKeyhole size={18} color={colors.warning} />
          )}
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{copy.evidenceGateLabel}</Text>
          <Text style={{ color: approved ? colors.success : colors.warning, fontWeight: '800', fontSize: 12 }}>{gateLabel(copy, gateStatus)}</Text>
        </View>
      </View>

      <View style={{ marginTop: 18, flexDirection: isWideWeb ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <View style={{ ...card, flex: 1, minWidth: 280 }}>
          <View style={headingRow}>
            <FileCheck2 size={20} color={colors.primary} />
            <Text accessibilityRole="header" style={sectionTitle}>{copy.evidenceOrdinaryTitle}</Text>
          </View>
          <Text style={{ ...body, fontSize: 12, marginTop: 5 }}>{copy.evidenceOrdinaryHint}</Text>
          {evidence.ordinary.data?.items.map((item) => (
            <OrdinaryCard
              key={item.id}
              item={item}
              copy={copy}
              pending={evidence.isActionPending}
              onUpload={(declaredAttribute) => void evidence.uploadOrdinary({ evidenceId: item.id, declaredAttribute })}
            />
          ))}
        </View>

        <View style={{ ...card, flex: 1, minWidth: 300, borderColor: 'rgba(245,158,11,0.55)', backgroundColor: 'rgba(245,158,11,0.06)' }}>
          <View style={headingRow}>
            <LockKeyhole size={20} color={colors.warning} />
            <Text accessibilityRole="header" style={sectionTitle}>{copy.evidenceRestrictedTitle}</Text>
          </View>
          <Text style={{ ...body, fontSize: 12, marginTop: 5 }}>{copy.evidenceRestrictedHint}</Text>
          {restricted ? (
            <RestrictedCard
              item={restricted}
              copy={copy}
              pending={evidence.isActionPending || journey.isActionPending}
              onUpload={() => void applyRestrictedAction(evidence.uploadRestricted)}
            />
          ) : null}
        </View>
      </View>

      {isPara ? (
        <View style={{ ...card, marginTop: 18 }}>
          <View style={headingRow}>
            <ShieldCheck size={20} color={colors.success} />
            <Text accessibilityRole="header" style={sectionTitle}>{copy.evidenceCleanExportTitle}</Text>
          </View>
          <Text style={{ ...body, fontSize: 12, marginTop: 5 }}>{copy.evidenceCleanExportHint}</Text>
          <Pressable
            disabled={journey.isActionPending}
            accessibilityRole="button"
            accessibilityLabel={journey.isActionPending ? copy.evidenceGeneratingExport : copy.evidenceGenerateExport}
            accessibilityState={{ disabled: journey.isActionPending }}
            onPress={() => void journey.exportParticipantEntry()}
            style={{ ...secondaryButton, opacity: journey.isActionPending ? 0.55 : 1 }}>
            <Text style={secondaryText}>{journey.isActionPending ? copy.evidenceGeneratingExport : copy.evidenceGenerateExport}</Text>
          </Pressable>
          {journey.exportResult ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: colors.success, fontWeight: '900' }}>{copy.evidenceExportProof}</Text>
              <Text style={{ ...body, fontSize: 12, marginTop: 3 }}>{copy.evidenceExportExcluded}</Text>
              <Text style={{ color: colors.text, fontWeight: '800', marginTop: 12 }}>{copy.evidenceExportPayload}</Text>
              <View style={codeBox}><Text selectable style={{ color: colors.text, fontSize: 11, lineHeight: 17 }}>{JSON.stringify(journey.exportResult, null, 2)}</Text></View>
            </View>
          ) : null}
        </View>
      ) : null}

      {approved ? (
        <Pressable accessibilityRole="button" accessibilityLabel={copy.evidenceContinueCheckout} onPress={() => router.push('/checkout')} style={primaryButton}><Text style={primaryText}>{copy.evidenceContinueCheckout}</Text></Pressable>
      ) : <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.warning, fontWeight: '700', marginTop: 18 }}>{copy.evidenceCheckoutLocked}</Text>}
      {evidence.actionError || journey.actionError ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={errorText}>{(evidence.actionError ?? journey.actionError)?.message}</Text>
      ) : null}
      <Text style={disclaimer}>{copy.evidenceDisclaimer}</Text>
    </ParticipantPortalShell>
  );
}

function OrdinaryCard({ item, copy, pending, onUpload }: {
  item: EligibilityEvidence;
  copy: CopyDict;
  pending: boolean;
  onUpload: (attribute?: EvidenceDeclaredAttribute) => void;
}) {
  const [value, setValue] = useState(item.type === 'federation_licence' ? '2028-01-01' : '');
  const isJudoFact = item.type === 'weigh_in' || item.type === 'belt_certificate' || item.type === 'federation_licence';
  const declaration = judoEvidenceDeclaration(item.type, value);
  const submit = () => {
    onUpload(declaration);
  };
  const placeholder = item.type === 'weigh_in'
    ? copy.evidenceWeightPlaceholder
    : item.type === 'belt_certificate'
      ? copy.evidenceBeltPlaceholder
      : copy.evidenceLicenceExpiryPlaceholder;
  return (
    <View style={{ ...evidenceRow, alignItems: 'stretch', flexDirection: 'column' }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ flex: 1 }}><Text style={itemTitle}>{item.label}</Text><Text style={fileText}>{item.fileName ?? copy.evidenceMockFileNote}</Text></View>
        <StatusPill status={item.status} label={statusLabel(copy, item.status)} />
      </View>
      {isJudoFact && (item.status === 'required' || item.status === 'rejected') ? (
        <TextInput
          accessibilityLabel={placeholder}
          value={value}
          onChangeText={setValue}
          keyboardType={item.type === 'weigh_in' ? 'decimal-pad' : 'default'}
          placeholder={placeholder}
          style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, color: colors.text }}
        />
      ) : null}
      {(item.status === 'required' || item.status === 'rejected') ? <ActionButton label={pending ? copy.evidenceUploading : copy.evidenceMockUpload} disabled={pending || (isJudoFact && !declaration)} onPress={submit} /> : null}
      {item.status === 'uploaded' || item.status === 'under_review' ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{copy.evidenceAwaitingReviewer}</Text> : null}
    </View>
  );
}

function RestrictedCard({ item, copy, pending, onUpload }: {
  item: RestrictedEvidence; copy: CopyDict; pending: boolean; onUpload: () => void;
}) {
  return (
    <View style={{ ...evidenceRow, alignItems: 'stretch', flexDirection: 'column' }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ flex: 1 }}><Text style={itemTitle}>{item.label}</Text><Text style={fileText}>{item.fileName ?? copy.evidenceMockFileNote}</Text></View>
        <StatusPill status={item.status} label={statusLabel(copy, item.status)} />
      </View>
      {item.accessLoggedAt ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{copy.evidenceAccessLogged.replace('{time}', item.accessLoggedAt)}</Text> : null}
      {item.rejectionReason ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={errorText}>
          {copy.evidenceRejectedReason.replace('{reason}', item.rejectionReason)}
        </Text>
      ) : null}
      {(item.status === 'required' || item.status === 'rejected') ? <ActionButton label={pending ? copy.evidenceUploading : copy.evidenceMockUpload} disabled={pending} onPress={onUpload} /> : null}
      {/* Reviewing is the OC's work and the backend refuses it from an athlete's token — the
          buttons that used to sit here returned Forbidden. They now live in the admin portal
          (Work queues → Evidence review); the athlete waits and sees the status change. */}
      {item.status === 'uploaded' || item.status === 'under_review' ? (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{copy.evidenceAwaitingReviewer}</Text>
      ) : null}
    </View>
  );
}

function ActionButton({ label, disabled, onPress, grow }: { label: string; disabled: boolean; onPress: () => void; grow?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={{ ...actionButton, flex: grow ? 1 : undefined, opacity: disabled ? 0.55 : 1 }}>
      <FileUp size={16} color={colors.primary} />
      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function StatusPill({ status, label }: { status: EvidenceStatus; label: string }) {
  const positive = status === 'approved';
  const negative = status === 'rejected';
  const color = positive ? colors.success : negative ? colors.danger : colors.warning;
  return <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: `${color}18` }}><Text style={{ color, fontSize: 10, fontWeight: '900' }}>{label.toUpperCase()}</Text></View>;
}

const title = { fontSize: 28, fontWeight: '800', color: colors.text } as const;
const body = { color: colors.textMuted, lineHeight: 20 } as const;
const card = { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14, padding: 18 } as const;
const sectionTitle = { color: colors.text, fontWeight: '800', fontSize: 17 } as const;
const headingRow = { flexDirection: 'row', alignItems: 'center', gap: 8 } as const;
const evidenceRow = { marginTop: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 } as const;
const itemTitle = { color: colors.text, fontWeight: '800' } as const;
const fileText = { color: colors.textMuted, fontSize: 11, marginTop: 3 } as const;
const actionButton = { minHeight: 44, borderWidth: 1, borderColor: colors.primary, borderRadius: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10, backgroundColor: colors.surface } as const;
const primaryButton = { marginTop: 18, minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 18, backgroundColor: colors.primary } as const;
const primaryText = { color: colors.primaryForeground, fontWeight: '800' } as const;
const secondaryButton = { marginTop: 12, minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface } as const;
const secondaryText = { color: colors.primary, fontWeight: '800' } as const;
const codeBox = { marginTop: 8, borderRadius: 10, padding: 12, backgroundColor: colors.surfaceMuted, maxHeight: 360 } as const;
const errorText = { color: colors.danger, fontSize: 12, marginTop: 10 } as const;
const disclaimer = { color: colors.textMuted, fontSize: 11, marginTop: 24, textAlign: 'center' } as const;
