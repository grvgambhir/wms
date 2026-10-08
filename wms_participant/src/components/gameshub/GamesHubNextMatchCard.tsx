import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { CARD_HOVER } from '@/constants/layout';
import type { ScheduleItem } from '@/domain/models/gameshub';
import type { MatchResult } from '@/domain/models/match';
import { useAppLayout } from '@/hooks/useAppLayout';
import { flagEmoji, formatClockTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { gradients } from '@/theme/gradients';

type GamesHubNextMatchCardProps = {
  item: ScheduleItem;
  venueName?: string;
  match?: MatchResult | null;
  onPress?: () => void;
};

/** Featured next-match hero on GamesHub (A17 mockup). */
export function GamesHubNextMatchCard({ item, venueName, match, onPress }: GamesHubNextMatchCardProps) {
  const { isWideWeb } = useAppLayout();
  const whenLabel = `${copy.gamesHubTodayLabel} · ${formatClockTime(item.startAt)}`;
  const sideAFlags = match?.sideA.countryCodes?.map(flagEmoji).join(' ') ?? '';
  const sideBFlags = match?.sideB.countryCodes?.map(flagEmoji).join(' ') ?? '';

  return (
    <Pressable onPress={onPress} disabled={!onPress} className={cn('active:scale-[0.99]', CARD_HOVER)}>
      <View className="overflow-hidden rounded-2xl">
        <LinearGradient
          colors={[...gradients.hero]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: isWideWeb ? 24 : 16, minHeight: isWideWeb ? 220 : undefined }}>
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-white/80">
              {copy.gamesHubNextMatch}
            </Text>
            <Text className="text-xs font-semibold text-white/90">{whenLabel}</Text>
          </View>

          <Text className="mt-3 text-base font-bold text-white">{item.title}</Text>
          {match ? (
            <Text className="mt-2 text-sm leading-5 text-white/90">
              {match.sideA.displayName} {sideAFlags}
              {'  vs  '}
              {match.sideB.displayName} {sideBFlags}
            </Text>
          ) : null}

          <Text className="mt-2 text-xs text-white/75">
            {[item.court, venueName].filter(Boolean).join(', ')}
          </Text>

          {onPress ? (
            <View className="mt-4 self-end rounded-full bg-white/20 px-4 py-2">
              <Text className="text-xs font-bold uppercase tracking-wide text-white">
                {copy.gamesHubViewMatch}
              </Text>
            </View>
          ) : null}
        </LinearGradient>
      </View>
    </Pressable>
  );
}