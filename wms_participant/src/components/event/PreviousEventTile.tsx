import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { CARD_HOVER } from '@/constants/layout';
import type { Event } from '@/domain/models/event';
import { cn } from '@/lib/utils';
import { resolveAsset } from '@/theme/assets';

type PreviousEventTileProps = {
  event: Event;
  onPress?: () => void;
  className?: string;
};

/** Compact previous-event tile for horizontal carousel (website order). */
export function PreviousEventTile({ event, onPress, className }: PreviousEventTileProps) {
  const imageSource = resolveAsset(event.cardImageKey ?? event.heroImageKey);

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'mr-3 w-40 overflow-hidden rounded-2xl border border-border bg-white active:opacity-90 lg:w-48',
        CARD_HOVER,
        className,
      )}>
      <View className="relative h-28">
        {imageSource ? (
          <Image source={imageSource} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View className="h-full bg-muted" />
        )}
        {event.statusBanner ? (
          <View className="absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5">
            <Text className="text-[9px] font-bold uppercase text-white">{event.statusBanner}</Text>
          </View>
        ) : null}
      </View>
      <View className="gap-1 p-3">
        <Text className="text-sm font-bold text-foreground" numberOfLines={2}>
          {event.name}
        </Text>
        <Text className="text-xs text-muted-foreground">{event.country}</Text>
      </View>
    </Pressable>
  );
}
