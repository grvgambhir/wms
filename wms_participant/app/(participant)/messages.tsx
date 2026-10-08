// P — the participant's message inbox. Athlete-facing half of the admin Communications
// Center (A06): the OC broadcasts to an audience segment, wms_api filters the delivery
// log to the segments this athlete belongs to, and what survives that filter lands here.
import { Mail, MessageSquare, Smartphone } from 'lucide-react-native';
import { View } from 'react-native';

import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { Text } from '@/components/ui/text';
import type { CommsAudienceId, CommsChannel, CommunicationRecord } from '@/domain/models/communications';
import { useMyInbox } from '@/features/communications/hooks/useMyInbox';
import { useCopy, type CopyDict } from '@/i18n';
import { formatCompactDate } from '@/lib/format';
import { colors } from '@/theme/colors';

function audienceLabel(copy: CopyDict, audienceId: CommsAudienceId): string {
  switch (audienceId) {
    case 'all-participants':
      return copy.inboxAudienceAll;
    case 'pending-payment':
      return copy.inboxAudiencePendingPayment;
    case 'incomplete-documents':
      return copy.inboxAudienceIncompleteDocs;
    case 'confirmed':
      return copy.inboxAudienceConfirmed;
    case 'tennis':
      return copy.inboxAudienceTennis;
    case 'rowing':
      return copy.inboxAudienceRowing;
    default:
      return audienceId;
  }
}

function channelLabel(copy: CopyDict, channel: CommsChannel): string {
  if (channel === 'email') return copy.inboxChannelEmail;
  if (channel === 'in-app') return copy.inboxChannelInApp;
  return copy.inboxChannelBoth;
}

function MessageRow({ record, copy }: { record: CommunicationRecord; copy: CopyDict }) {
  // A screen reader should hear one coherent announcement — subject, who it went to,
  // channel and date — rather than four disconnected fragments read in layout order.
  const spoken = `${record.subject}. ${copy.inboxSentTo} ${audienceLabel(copy, record.audienceId)}, ${channelLabel(copy, record.channel)}, ${formatCompactDate(record.sentAt)}`;

  return (
    <View
      className="rounded-2xl border border-border bg-card p-4"
      accessible
      accessibilityRole="text"
      accessibilityLabel={spoken}
    >
      <View
        className="flex-row items-start gap-3"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        aria-hidden
      >
        <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-full bg-muted">
          {record.channel === 'email' ? (
            <Mail size={15} color={colors.primary} />
          ) : record.channel === 'in-app' ? (
            <Smartphone size={15} color={colors.primary} />
          ) : (
            <MessageSquare size={15} color={colors.primary} />
          )}
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-foreground">{record.subject}</Text>
          <Text className="mt-1 text-[12px] text-muted-foreground">
            {copy.inboxSentTo} {audienceLabel(copy, record.audienceId)} · {channelLabel(copy, record.channel)}
          </Text>
        </View>
        <Text className="text-[11px] text-muted-foreground">{formatCompactDate(record.sentAt)}</Text>
      </View>
    </View>
  );
}

export default function MessagesScreen() {
  const copy = useCopy();
  const { data, isLoading } = useMyInbox();

  if (isLoading) {
    return (
      <ParticipantPortalShell activeId="messages">
        <LoadingState message={copy.inboxTitle} />
      </ParticipantPortalShell>
    );
  }

  const messages = data?.items ?? [];

  return (
    <ParticipantPortalShell activeId="messages">
      <View className="gap-4">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-extrabold text-foreground">
            {copy.inboxTitle}
          </Text>
          <Text className="text-[13px] text-muted-foreground">{copy.inboxSubtitle}</Text>
        </View>

        {messages.length === 0 ? (
          <View className="rounded-2xl border border-border bg-card p-5">
            <Text accessibilityRole="header" className="text-base font-bold text-foreground">
              {copy.inboxEmpty}
            </Text>
            <Text className="mt-1 text-[13px] text-muted-foreground">{copy.inboxEmptyBody}</Text>
          </View>
        ) : (
          <View
            className="gap-2.5"
            accessibilityRole="list"
            accessibilityLabel={`${copy.inboxTitle}: ${messages.length}`}
          >
            {messages.map((record) => (
              <MessageRow key={record.id} record={record} copy={copy} />
            ))}
          </View>
        )}
      </View>
    </ParticipantPortalShell>
  );
}
