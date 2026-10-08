import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import type { SportCategoryFilter } from '@/features/events/utils/sportPresentation';
import { cn } from '@/lib/utils';

const FILTERS: { id: SportCategoryFilter; label: string }[] = [
  { id: 'all', label: copy.sportFilterAll },
  { id: 'racket', label: copy.sportFilterRacket },
  { id: 'team', label: copy.sportFilterTeam },
  { id: 'water', label: copy.sportFilterWater },
  { id: 'other', label: copy.sportFilterOther },
];

type SportCategoryChipsProps = {
  value: SportCategoryFilter;
  onChange: (value: SportCategoryFilter) => void;
};

/** A05 horizontal category filter chips. */
export function SportCategoryChips({ value, onChange }: SportCategoryChipsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pr-4">
      {FILTERS.map((filter) => {
        const active = value === filter.id;
        return (
          <Pressable
            key={filter.id}
            onPress={() => onChange(filter.id)}
            className={cn(
              'rounded-full px-4 py-2',
              active ? 'bg-primary' : 'bg-muted',
            )}>
            <Text className={cn('text-sm font-semibold', active ? 'text-primary-foreground' : 'text-foreground')}>
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
