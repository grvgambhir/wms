import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { cn } from '@/lib/utils';

export type EventListTab = 'all' | 'registered';

type EventFilterTabsProps = {
  value: EventListTab;
  onChange: (tab: EventListTab) => void;
};

/** A03 segmented tabs — All Events / My Registered. */
export function EventFilterTabs({ value, onChange }: EventFilterTabsProps) {
  const tabs: { id: EventListTab; label: string }[] = [
    { id: 'all', label: copy.eventsAllEvents },
    { id: 'registered', label: copy.eventsMyRegistered },
  ];

  return (
    <View className="mb-4 flex-row border-b border-border">
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            className={cn('mr-6 pb-3 hover:opacity-80 active:opacity-80')}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}>
            <Text className={cn('text-sm font-semibold', active ? 'text-primary' : 'text-muted-foreground')}>
              {tab.label}
            </Text>
            {active ? <View className="mt-2 h-0.5 rounded-full bg-primary" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
