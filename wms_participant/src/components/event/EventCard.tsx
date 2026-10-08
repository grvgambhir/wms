import { LinearGradient } from 'expo-linear-gradient';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { RegistrationStatusBadge, type RegistrationStatus } from '@/components/registration/RegistrationStatusBadge';
import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { CARD_HOVER } from '@/constants/layout';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';
import { gradients } from '@/theme/gradients';

export type EventCardStatus = 'registration_open' | 'registration_closed' | 'live' | 'completed';

const EVENT_STATUS_LABELS: Record<EventCardStatus, string> = {
  registration_open: copy.registrationOpen,
  registration_closed: copy.registrationClosed,
  live: copy.eventLive,
  completed: copy.eventCompleted,
};

type EventCardProps = {
  name: string;
  city: string;
  country: string;
  dateRange: string;
  status: EventCardStatus;
  featured?: boolean;
  registrationStatus?: RegistrationStatus;
  onPress?: () => void;
  className?: string;
};

/** Discovery card for A03 — gradient hero + glass body. */
export function EventCard({
  name,
  city,
  country,
  dateRange,
  status,
  featured,
  registrationStatus,
  onPress,
  className,
}: EventCardProps) {
  const content = (
    <GlassSurface className={cn('gap-0 p-0', className)} strong>
      <View className="overflow-hidden">
        <LinearGradient
          colors={[...gradients.hero]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ minHeight: 132, justifyContent: 'flex-end', padding: 16 }}>
          <View className="absolute inset-0 bg-black/10" />
          <View>
            <Text className="text-xs font-semibold uppercase tracking-[2px] text-white/80">Masters Games</Text>
            <Text className="mt-1 text-xl font-bold leading-tight text-white">{name}</Text>
          </View>
        </LinearGradient>
      </View>

      <View className="gap-3 p-4">
        <View className="flex-row flex-wrap items-center gap-2">
          {featured ? (
            <View className="rounded-full bg-amber-500/15 px-3 py-1">
              <Text className="text-xs font-semibold text-amber-700">{copy.featuredEvent}</Text>
            </View>
          ) : null}
          <View className="rounded-full bg-primary/10 px-3 py-1">
            <Text className="text-xs font-semibold text-primary">{EVENT_STATUS_LABELS[status]}</Text>
          </View>
          {registrationStatus ? <RegistrationStatusBadge status={registrationStatus} /> : null}
        </View>

        <View className="flex-row items-center gap-1.5">
          <MapPin size={15} color={colors.textMuted} />
          <Text className="text-sm text-muted-foreground">
            {city}, {country}
          </Text>
        </View>

        <View className="flex-row items-center gap-2 rounded-xl bg-primary/5 px-3 py-2.5">
          <CalendarDays size={16} color={colors.primary} />
          <Text className="text-sm font-semibold text-foreground">{dateRange}</Text>
        </View>

        {onPress ? (
          <View className="flex-row items-center justify-between border-t border-border/60 pt-3">
            <Text className="text-sm font-semibold text-primary">View event details</Text>
            <ChevronRight size={18} color={colors.primary} />
          </View>
        ) : null}
      </View>
    </GlassSurface>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={cn('active:scale-[0.99]', CARD_HOVER)}>
        {content}
      </Pressable>
    );
  }

  return content;
}
