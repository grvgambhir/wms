import { MapPin } from 'lucide-react-native';
import { View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';
import type { Venue } from '@/domain/models/gameshub';
import { colors } from '@/theme/colors';

type VenueCardProps = {
  venue: Venue;
};

export function VenueCard({ venue }: VenueCardProps) {
  return (
    <GlassSurface className="flex-row items-start gap-3 p-4">
      <View className="rounded-xl bg-primary/10 p-2.5">
        <MapPin size={18} color={colors.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-foreground">{venue.name}</Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {venue.address ?? venue.city}
        </Text>
      </View>
    </GlassSurface>
  );
}
