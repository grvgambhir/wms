import { Award, CalendarDays, IdCard, MapPin, Star, Trophy } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { CARD_HOVER, gridItemClass } from '@/constants/layout';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

type QuickAccessId = 'schedule' | 'results' | 'venues' | 'pass' | 'medals' | 'favourites';

type GamesHubQuickAccessProps = {
  onPress: (id: QuickAccessId) => void;
  /** Sidebar next to the next-match hero uses a 2-col tile grid on wide web. */
  variant?: 'page' | 'rail';
};

const TILES: Array<{
  id: QuickAccessId;
  label: string;
  icon: typeof CalendarDays;
}> = [
  { id: 'schedule', label: copy.gamesHubQuickSchedule, icon: CalendarDays },
  { id: 'results', label: copy.gamesHubQuickResults, icon: Trophy },
  { id: 'venues', label: copy.gamesHubQuickVenues, icon: MapPin },
  { id: 'pass', label: copy.gamesHubQuickPass, icon: IdCard },
  { id: 'medals', label: copy.gamesHubQuickMedals, icon: Award },
  { id: 'favourites', label: copy.gamesHubQuickFavourites, icon: Star },
];

/** GamesHub shortcuts — 3-col on phone, 2-col in a web rail, 6-across on desktop page. */
export function GamesHubQuickAccess({ onPress, variant = 'page' }: GamesHubQuickAccessProps) {
  const { layoutTier } = useAppLayout();

  const columns = variant === 'rail' ? 2 : layoutTier === 'desktop' ? 6 : layoutTier === 'tablet' ? 3 : 3;

  return (
    <View className="flex-row flex-wrap justify-between gap-y-3">
      {TILES.map((tile) => {
        const Icon = tile.icon;
        return (
          <Pressable
            key={tile.id}
            onPress={() => onPress(tile.id)}
            className={cn(
              gridItemClass(columns),
              'items-center gap-2 rounded-2xl border border-border/70 bg-white py-4 active:opacity-80',
              CARD_HOVER,
              layoutTier !== 'compact' && 'py-5',
            )}>
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Icon size={20} color={colors.primary} />
            </View>
            <Text className="text-center text-[11px] font-semibold text-foreground">{tile.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
