import { Image } from 'expo-image';
import { CalendarDays, ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { Event } from '@/domain/models/event';
import { formatEventDateRange } from '@/lib/format';
import { resolveAsset } from '@/theme/assets';
import { colors } from '@/theme/colors';

type EventListRowProps = {
  event: Event;
  onPress?: () => void;
};

function formatPlace(event: Event): string {
  if (event.state) {
    return `${event.city}, ${event.state} · ${event.country}`;
  }

  return `${event.city}, ${event.country}`;
}

/** A03 compact list row — thumbnail + title + location + dates (mockup "Other Events"). */
export function EventListRow({ event, onPress }: EventListRowProps) {
  const imageSource = resolveAsset(event.heroImageKey);

  const content = (
    <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-white p-3">
      <View className="h-16 w-16 overflow-hidden rounded-xl bg-muted">
        {imageSource ? (
          <Image source={imageSource} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View className="h-full w-full bg-primary/10" />
        )}
      </View>

      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-bold text-foreground" numberOfLines={2}>
          {event.name}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {formatPlace(event)}
        </Text>
        <View className="flex-row items-center gap-1">
          <CalendarDays size={12} color={colors.textMuted} />
          <Text className="text-xs text-muted-foreground">
            {formatEventDateRange(event.startDate, event.endDate)}
          </Text>
        </View>
      </View>

      {onPress ? <ChevronRight size={18} color={colors.primary} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-90">
        {content}
      </Pressable>
    );
  }

  return content;
}
