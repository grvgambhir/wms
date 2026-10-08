// P — the participant's own Games accreditation pass. This is the athlete-facing half
// of the admin Accreditation Desk (A03): both portals read the SAME record through
// wms_api, so when the OC issues a badge the pass below goes live on the next refetch.
import { BadgeCheck, CheckCircle2, Clock, ShieldOff, XCircle } from 'lucide-react-native';
import { View } from 'react-native';

import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { Text } from '@/components/ui/text';
import type { AccessZone, AccreditationRecord } from '@/domain/models/accreditationDesk';
import { useMyAccreditationPass } from '@/features/accreditation/hooks/useMyAccreditationPass';
import { useCopy, type CopyDict } from '@/i18n';
import { formatCompactDate } from '@/lib/format';
import { colors } from '@/theme/colors';

function zoneLabel(copy: CopyDict, zone: AccessZone): string {
  switch (zone) {
    case 'field-of-play':
      return copy.myPassZoneFieldOfPlay;
    case 'athlete-lounge':
      return copy.myPassZoneAthleteLounge;
    case 'media':
      return copy.myPassZoneMedia;
    case 'officials':
      return copy.myPassZoneOfficials;
    case 'back-of-house':
      return copy.myPassZoneBackOfHouse;
    default:
      return zone;
  }
}

/** One label/value line inside the pass body. */
function PassRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      className="flex-row items-center justify-between border-b border-border/60 py-2.5"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden className="text-[13px] text-muted-foreground">
        {label}
      </Text>
      <Text importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden className="text-[13px] font-semibold text-foreground">
        {value}
      </Text>
    </View>
  );
}

/** Photo / eligibility gate readout — the two checks the OC must approve before issue. */
function CheckRow({ label, ok, pending }: { label: string; ok: boolean; pending: string }) {
  return (
    <View
      className="flex-row items-center gap-2"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${pending}`}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
        {ok ? (
          <CheckCircle2 size={15} color={colors.success} />
        ) : (
          <Clock size={15} color={colors.warning} />
        )}
      </View>
      <Text
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        aria-hidden
        className="text-[12px] text-muted-foreground"
      >
        {label}: <Text className="font-semibold text-foreground">{pending}</Text>
      </Text>
    </View>
  );
}

export default function MyAccreditationScreen() {
  const copy = useCopy();
  const { data: record, isLoading, isError } = useMyAccreditationPass();

  if (isLoading) {
    return (
      <ParticipantPortalShell activeId="accreditation">
        <LoadingState message={copy.myPassTitle} />
      </ParticipantPortalShell>
    );
  }

  if (isError) {
    return (
      <ParticipantPortalShell activeId="accreditation">
        <ErrorState title={copy.myPassNoRecord} description={copy.myPassNoRecordBody} />
      </ParticipantPortalShell>
    );
  }

  return (
    <ParticipantPortalShell activeId="accreditation">
      <View className="gap-4">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-extrabold text-foreground">
            {copy.myPassTitle}
          </Text>
          <Text className="text-[13px] text-muted-foreground">{copy.myPassSubtitle}</Text>
        </View>

        {record ? <PassCard record={record} copy={copy} /> : <NoRecord copy={copy} />}
      </View>
    </ParticipantPortalShell>
  );
}

function NoRecord({ copy }: { copy: CopyDict }) {
  return (
    <View className="rounded-2xl border border-border bg-card p-5">
      <Text accessibilityRole="header" className="text-base font-bold text-foreground">
        {copy.myPassNoRecord}
      </Text>
      <Text className="mt-1 text-[13px] text-muted-foreground">{copy.myPassNoRecordBody}</Text>
    </View>
  );
}

function PassCard({ record, copy }: { record: AccreditationRecord; copy: CopyDict }) {
  const issued = record.status === 'issued';
  const revoked = record.status === 'revoked';

  // The state of the credential is the whole point of this screen, so it is announced
  // as one sentence including the badge number when there is one — a reader should not
  // have to hunt further down the card to learn whether the pass is actually valid.
  const statusHeading = issued
    ? copy.myPassIssuedHeading
    : revoked
      ? copy.myPassRevokedHeading
      : copy.myPassPendingHeading;
  const statusDetail = issued
    ? record.badgeNumber
      ? `${copy.myPassBadgeNumber}: ${record.badgeNumber}`
      : ''
    : revoked
      ? copy.myPassRevokedBody
      : copy.myPassPendingBody;

  return (
    <View className="gap-4">
      {/* Status banner — the one thing the athlete actually looks for. */}
      <View
        className={`flex-row items-center gap-3 rounded-2xl border p-4 ${
          issued
            ? 'border-success/30 bg-success/10'
            : revoked
              ? 'border-danger/30 bg-danger/10'
              : 'border-warning/30 bg-warning/10'
        }`}
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`${statusHeading}. ${statusDetail}`}
      >
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
          {issued ? (
            <BadgeCheck size={22} color={colors.success} />
          ) : revoked ? (
            <ShieldOff size={22} color={colors.danger} />
          ) : (
            <Clock size={22} color={colors.warning} />
          )}
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-foreground">{statusHeading}</Text>
          {!issued ? (
            <Text className="mt-0.5 text-[12px] text-muted-foreground">
              {revoked ? copy.myPassRevokedBody : copy.myPassPendingBody}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="rounded-2xl border border-border bg-card p-5">
        <Text className="text-lg font-extrabold text-foreground">{record.participantName}</Text>
        <Text className="text-[12px] text-muted-foreground">
          {record.nationalityCountryCode} · {record.sportName}
        </Text>

        <View className="mt-3">
          {/* Badge number only exists once the OC has actually issued. */}
          {record.badgeNumber ? (
            <PassRow label={copy.myPassBadgeNumber} value={record.badgeNumber} />
          ) : null}
          <PassRow label={copy.myPassRole} value={record.role} />
          <PassRow label={copy.myPassSport} value={record.sportName} />
          <PassRow
            label={copy.myPassValid}
            value={`${formatCompactDate(record.validFrom)} – ${formatCompactDate(record.validUntil)}`}
          />
        </View>

        <Text className="mt-4 text-[11px] font-semibold tracking-wide text-muted-foreground">
          {copy.myPassAccessZones.toUpperCase()}
        </Text>
        <View
          className="mt-2 flex-row flex-wrap gap-2"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${copy.myPassAccessZones}: ${record.accessZones.map((zone) => zoneLabel(copy, zone)).join(', ')}`}
        >
          {record.accessZones.map((zone) => (
            <View key={zone} className="rounded-full bg-muted px-3 py-1">
              <Text className="text-[12px] text-foreground">{zoneLabel(copy, zone)}</Text>
            </View>
          ))}
        </View>

        <View className="mt-4 gap-1.5 border-t border-border/60 pt-3">
          <CheckRow
            label={copy.myPassPhotoCheck}
            ok={record.photoStatus === 'approved'}
            pending={
              record.photoStatus === 'approved'
                ? copy.accreditationPhotoApproved
                : record.photoStatus === 'rejected'
                  ? copy.accreditationPhotoRejected
                  : copy.accreditationPhotoSubmitted
            }
          />
          <CheckRow
            label={copy.myPassEligibilityCheck}
            ok={record.eligibilityStatus === 'approved'}
            pending={
              record.eligibilityStatus === 'approved'
                ? copy.accreditationEligApproved
                : copy.accreditationEligPending
            }
          />
        </View>
      </View>
    </View>
  );
}
