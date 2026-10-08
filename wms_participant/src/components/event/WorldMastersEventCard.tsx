import { Image } from 'expo-image';
import { CalendarDays, Globe2, Trophy } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { CARD_HOVER } from '@/constants/layout';
import type { Event } from '@/domain/models/event';
import { formatEventDateRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { resolveAsset } from '@/theme/assets';
import { colors } from '@/theme/colors';

type WorldMastersEventCardProps = {
  event: Event;
  onPress?: () => void;
  className?: string;
};

function formatPlace(event: Event): string {
  if (event.state) return `${event.city}, ${event.state}`;
  return `${event.city}, ${event.country}`;
}

/** Website-style upcoming event row — image, status badge, meta icons, CTA. */
export function WorldMastersEventCard({ event, onPress, className }: WorldMastersEventCardProps) {
  const imageSource = resolveAsset(event.cardImageKey ?? event.heroImageKey);
  const ctaLabel = event.ctaLabel ?? 'More info';

  return (
    <Pressable
      onPress={onPress}
      className={cn('overflow-hidden rounded-2xl border border-border bg-white active:opacity-95', CARD_HOVER, className)}>
      <View className="flex-row">
        <View className="relative w-[38%] min-h-[180px]">
          {imageSource ? (
            <Image source={imageSource} style={{ width: '100%', height: '100%', minHeight: 180 }} contentFit="cover" />
          ) : (
            <View className="min-h-[180px] flex-1 bg-primary/10" />
          )}
          {event.statusBanner ? (
            <View className="absolute left-2 top-2 rounded-md bg-emerald-500 px-2 py-1">
              <Text className="text-[10px] font-bold uppercase text-white">{event.statusBanner}</Text>
            </View>
          ) : null}
        </View>

        <View className="flex-1 gap-2 p-3">
          <Text className="text-base font-bold leading-tight text-foreground">{event.name}</Text>
          {event.listingCopy ? (
            <Text className="text-xs leading-5 text-muted-foreground" numberOfLines={3}>
              {event.listingCopy}
            </Text>
          ) : null}

          <View className="gap-1.5">
            <View className="flex-row items-center gap-1.5">
              <Globe2 size={12} color={colors.textMuted} />
              <Text className="text-[11px] text-muted-foreground">
                <Text className="font-semibold text-foreground">Country </Text>
                {event.country}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <CalendarDays size={12} color={colors.textMuted} />
              <Text className="text-[11px] text-muted-foreground">
                <Text className="font-semibold text-foreground">Date </Text>
                {formatEventDateRange(event.startDate, event.endDate)}
              </Text>
            </View>
            {event.sportCount ? (
              <View className="flex-row items-center gap-1.5">
                <Trophy size={12} color={colors.textMuted} />
                <Text className="text-[11px] text-muted-foreground">
                  <Text className="font-semibold text-foreground">Sports </Text>
                  {event.sportCount}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="mt-1 self-start rounded-full bg-primary px-4 py-2">
            <Text className="text-xs font-bold text-white">{ctaLabel}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
