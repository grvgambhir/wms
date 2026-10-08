import { View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';

export type EventStatItem = {
  value: string;
  label: string;
};

type EventStatCardsProps = {
  items: EventStatItem[];
};

/** A04 three-up stats row (Sports, Participants, Countries). */
export function EventStatCards({ items }: EventStatCardsProps) {
  return (
    <View className="flex-row gap-2">
      {items.map((item) => (
        <GlassSurface key={item.label} className="flex-1 items-center px-2 py-4">
          <Text className="text-xl font-bold text-foreground">{item.value}</Text>
          <Text className="mt-1 text-center text-xs text-muted-foreground">{item.label}</Text>
        </GlassSurface>
      ))}
    </View>
  );
}
