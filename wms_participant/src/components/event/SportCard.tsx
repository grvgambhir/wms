import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { QuotaBadge, type QuotaStatus } from '@/components/registration/QuotaBadge';
import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';
import { CARD_HOVER } from '@/constants/layout';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';
import { gradients } from '@/theme/gradients';

type SportCardProps = {
  name: string;
  subtitle?: string;
  availability: QuotaStatus;
  iconLabel?: string;
  onPress?: () => void;
  className?: string;
};

/** Sport selection card for A05 — glass surface + gradient sport icon. */
export function SportCard({ name, subtitle, availability, iconLabel, onPress, className }: SportCardProps) {
  const content = (
    <GlassSurface className={cn('p-4', className)}>
      <View className="flex-row items-center gap-3">
        <LinearGradient
          colors={[...gradients.sportIcon]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            height: 52,
            width: 52,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text className="text-xl font-bold text-white">{iconLabel ?? name.slice(0, 1)}</Text>
        </LinearGradient>
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold text-foreground">{name}</Text>
          {subtitle ? <Text className="text-sm text-muted-foreground">{subtitle}</Text> : null}
        </View>
        <QuotaBadge status={availability} />
      </View>
      {onPress ? (
        <View className="mt-3 flex-row items-center justify-end gap-1 border-t border-border/50 pt-3">
          <Text className="text-sm font-semibold text-primary">Select sport</Text>
          <ChevronRight size={16} color={colors.primary} />
        </View>
      ) : null}
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
