import { CalendarClock } from 'lucide-react-native';
import { View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';
import type { ScheduleItem } from '@/domain/models/gameshub';
import { formatClockTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

type ScheduleCardProps = {
  item: ScheduleItem;
  venueName?: string;
};

/** Today's schedule row — time + title + venue (A17 mockup). */
export function ScheduleCard({ item, venueName }: ScheduleCardProps) {
  const isMatch = item.type === 'match';

  return (
    <GlassSurface className="flex-row items-start gap-3 p-4">
      <View className={cn('min-w-[72px] rounded-xl px-2 py-2', isMatch ? 'bg-emerald-50' : 'bg-primary/10')}>
        <Text className={cn('text-center text-xs font-bold', isMatch ? 'text-emerald-700' : 'text-primary')}>
          {formatClockTime(item.startAt)}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-foreground">{item.title}</Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {[item.court, venueName].filter(Boolean).join(' · ') || copyFallback(item)}
        </Text>
      </View>
      <CalendarClock size={16} color={colors.textMuted} />
    </GlassSurface>
  );
}

function copyFallback(item: ScheduleItem): string {
  return item.type === 'ceremony' ? 'Official programme' : 'Event venue TBC';
}