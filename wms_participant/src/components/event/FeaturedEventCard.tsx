import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarDays, MapPin } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { WmsMark } from '@/components/brand/WmsMark';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { CARD_HOVER } from '@/constants/layout';
import type { Event } from '@/domain/models/event';
import { formatEventDateRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { resolveAsset } from '@/theme/assets';

type FeaturedEventCardProps = {
  event: Event;
  onPress?: () => void;
  className?: string;
};

function formatPlace(event: Event): string {
  if (event.state) {
    return `${event.city}, ${event.state}`;
  }

  return `${event.city}, ${event.country}`;
}

/** A03 featured hero card — event photo with World Masters Sport mark (not the generic IMGA circle). */
export function FeaturedEventCard({ event, onPress, className }: FeaturedEventCardProps) {
  const imageSource = resolveAsset(event.cardImageKey ?? event.heroImageKey);

  const content = (
    <View className="overflow-hidden rounded-2xl">
      <View className="relative min-h-[200px]">
        {imageSource ? (
          <Image source={imageSource} style={{ width: '100%', height: 200 }} contentFit="cover" />
        ) : (
          <View className="h-[200px] bg-primary" />
        )}

        <LinearGradient
          colors={['transparent', 'rgba(4, 30, 71, 0.55)', 'rgba(4, 30, 71, 0.92)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}
        />

        <View className="absolute right-3 top-3 rounded-full bg-emerald-500 px-3 py-1">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-white">{copy.featuredEvent}</Text>
        </View>

        <View className="absolute left-3 top-3">
          <WmsMark size="sm" />
        </View>

        <View className="absolute bottom-0 left-0 right-0 gap-1.5 p-4">
          <Text className="text-lg font-bold leading-tight text-white">{event.name}</Text>
          <View className="flex-row items-center gap-1.5">
            <MapPin size={14} color="#FFFFFF" />
            <Text className="text-sm text-white/90">{formatPlace(event)}</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <CalendarDays size={14} color="#FFFFFF" />
            <Text className="text-sm text-white/90">
              {formatEventDateRange(event.startDate, event.endDate)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={cn('active:scale-[0.99]', CARD_HOVER, className)}>
        {content}
      </Pressable>
    );
  }

  return <View className={className}>{content}</View>;
}
