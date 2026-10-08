import { BlurView } from 'expo-blur';
import { Platform, View, type ViewProps } from 'react-native';

import { cn } from '@/lib/utils';
import { glass } from '@/theme/glass';

type GlassSurfaceProps = ViewProps & {
  children: React.ReactNode;
  className?: string;
  strong?: boolean;
};

/** Frosted glass card surface — BlurView on native, translucent fallback on web. */
export function GlassSurface({ children, className, strong = false, style, ...props }: GlassSurfaceProps) {
  const backgroundColor = strong ? glass.backgroundStrong : glass.background;

  if (Platform.OS === 'web') {
    return (
      <View
        className={cn('overflow-hidden rounded-2xl border shadow-lg', className)}
        style={[
          {
            backgroundColor,
            borderColor: glass.border,
            shadowColor: glass.shadow,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 1,
            shadowRadius: 24,
          },
          style,
        ]}
        {...props}>
        {children}
      </View>
    );
  }

  return (
    <View
      className={cn('overflow-hidden rounded-2xl border shadow-lg', className)}
      style={[
        {
          borderColor: glass.border,
          shadowColor: glass.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 1,
          shadowRadius: 20,
        },
        style,
      ]}
      {...props}>
      <BlurView
        intensity={glass.blurIntensity}
        tint="light"
        style={{ backgroundColor }}
        className="flex-1">
        {children}
      </BlurView>
    </View>
  );
}
