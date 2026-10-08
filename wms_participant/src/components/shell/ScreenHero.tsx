import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { gradients } from '@/theme/gradients';

type ScreenHeroProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  footer?: React.ReactNode;
  className?: string;
};

/** Gradient hero banner — one strong visual moment per screen (mockup-aligned). */
export function ScreenHero({ eyebrow, title, subtitle, onBack, footer, className }: ScreenHeroProps) {
  return (
    <View className={cn('mb-4 overflow-hidden rounded-2xl', className)}>
      <LinearGradient
        colors={[...gradients.hero]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 16, paddingTop: onBack ? 12 : 20, paddingBottom: footer ? 16 : 20 }}>
        <View className="absolute inset-0 bg-black/10" />

        {onBack ? (
          <Pressable
            onPress={onBack}
            className="mb-3 h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/20 active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <ChevronLeft size={22} color="#FFFFFF" />
          </Pressable>
        ) : null}

        {eyebrow ? (
          <Text className="text-xs font-bold uppercase tracking-[2px] text-white/75">{eyebrow}</Text>
        ) : null}
        <Text accessibilityRole="header" className={cn('font-bold text-white', eyebrow ? 'mt-1 text-2xl lg:text-4xl' : 'text-2xl lg:text-4xl')}>{title}</Text>
        {subtitle ? <Text className="mt-1.5 text-sm leading-5 text-white/85 lg:text-base">{subtitle}</Text> : null}
        {footer ? <View className="mt-4">{footer}</View> : null}
      </LinearGradient>
    </View>
  );
}
