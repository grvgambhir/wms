import { ChevronRight, Sun } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { CARD_HOVER } from '@/constants/layout';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

type EventDayInfoCardProps = {
  eventName: string;
  locationLabel: string;
  onPress?: () => void;
};

/** Weather / conditions strip on GamesHub (A17 mockup). */
export function EventDayInfoCard({ eventName, locationLabel, onPress }: EventDayInfoCardProps) {
  const body = (
    <GlassSurface className="flex-row items-center gap-3 p-4">
      <View className="rounded-xl bg-amber-500/15 p-2.5">
        <Sun size={20} color="#B45309" />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold text-foreground">{locationLabel}</Text>
        <Text className="text-xs text-muted-foreground">{copy.gamesHubEventDayInfo}</Text>
        <Text className="text-[11px] text-muted-foreground">{eventName}</Text>
      </View>
      {onPress ? <ChevronRight size={18} color={colors.textMuted} /> : null}
    </GlassSurface>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={cn('active:opacity-90', CARD_HOVER)}>
        {body}
      </Pressable>
    );
  }

  return body;
}