import { CheckCircle2, UserRound } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { CARD_HOVER } from '@/constants/layout';
import type { AthleteSummary } from '@/domain/models/athlete';
import { countryName, flagEmoji } from '@/lib/format';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

type PartnerCardProps = {
  partner: AthleteSummary;
  selected?: boolean;
  requestStatus?: 'pending' | 'accepted' | 'declined' | 'cancelled';
  onSelect?: () => void;
  onSendRequest?: () => void;
  sending?: boolean;
  awaitingResponse?: boolean;
  /** A11 "I have a partner" uses select, not send-request. */
  confirmLabel?: string;
  className?: string;
};

/** Partner finder row for A12 — name, flag, country, age, request/select CTA. */
export function PartnerCard({
  partner,
  selected,
  requestStatus,
  onSelect,
  onSendRequest,
  sending,
  awaitingResponse,
  confirmLabel,
  className,
}: PartnerCardProps) {
  const fullName = `${partner.firstName} ${partner.lastName}`;
  const country = countryName(partner.nationalityCountryCode);
  const confirmed = requestStatus === 'accepted' || selected;
  const pending = requestStatus === 'pending';
  const showCta = Boolean(onSendRequest) && !confirmed && !pending;

  return (
    <Pressable onPress={onSelect} disabled={!onSelect} className={cn('w-full active:scale-[0.99]', CARD_HOVER, className)}>
      <GlassSurface className={cn('p-4', selected && 'border-2 border-primary')}>
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <UserRound size={22} color={colors.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">
              {fullName} {flagEmoji(partner.nationalityCountryCode)}
            </Text>
            {country ? <Text className="text-sm text-muted-foreground">{country}</Text> : null}
            <Text className="text-sm text-muted-foreground">
              {partner.age} years
              {partner.experienceLabel ? ` · ${partner.experienceLabel}` : ''}
            </Text>
          </View>
          {confirmed ? <CheckCircle2 size={22} color="#047857" /> : null}
        </View>

        {showCta ? (
          <Pressable
            onPress={onSendRequest}
            disabled={sending}
            className="mt-3 items-center rounded-xl border border-primary bg-white py-3 hover:bg-primary/5 active:opacity-80">
            <Text className="text-sm font-semibold text-primary">
              {sending ? copy.partnerFinderSending : (confirmLabel ?? copy.partnerFinderSendRequest)}
            </Text>
          </Pressable>
        ) : null}

        {pending ? (
          <View className="mt-3 items-center rounded-xl bg-amber-50 py-3">
            <Text className="text-sm font-semibold text-amber-800">
              {awaitingResponse ? copy.partnerFinderWaitingReply : copy.partnerFinderRequestPending}
            </Text>
          </View>
        ) : null}

        {confirmed ? (
          <Text className="mt-3 text-center text-sm font-semibold text-emerald-700">
            {copy.partnerFinderConfirmed}
          </Text>
        ) : null}
      </GlassSurface>
    </Pressable>
  );
}
